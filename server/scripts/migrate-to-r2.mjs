import 'dotenv/config'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import mongoose from 'mongoose'
import { connectDb, dbReady } from '../src/db.js'
import { r2Configured, putR2 } from '../src/services/r2.js'
import GeneratedModel from '../src/models/GeneratedModel.js'
import ModelVersionTree from '../src/models/ModelVersionTree.js'
import Image from '../src/models/Image.js'
import Post from '../src/models/Post.js'

// One-off migration: push the files that only ever landed on THIS machine's disk
// (from the old FILES_STORAGE=local period) up to the shared Cloudflare R2 bucket,
// then rewrite their DB URLs from the disk-only prefixes (/uploads, /images) to
// the R2-served /files prefix. After this, a teammate on the same Atlas + R2 stops
// getting 404s for these models/images — they resolve from R2 for everyone.
//
//   node scripts/migrate-to-r2.mjs        # DRY-RUN: report what would move
//   node scripts/migrate-to-r2.mjs --go   # actually upload + rewrite
//
// Uploads ONLY files the DB actually references (Library cards, community posts,
// version-tree nodes, image records) — orphan captures on disk are left behind,
// so we never push unused junk to the shared bucket. Safe to re-run: uploads
// overwrite the same key; only URLs whose bytes reached R2 get rewritten.

const GO = process.argv.includes('--go')
const UPLOAD_DIR = fileURLToPath(new URL('../.devdata/uploads/', import.meta.url))
const IMAGE_DIR = fileURLToPath(new URL('../.devdata/images/', import.meta.url))

const MIME = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}
const mimeFor = (name) => MIME[name.toLowerCase().split('.').pop()] || 'application/octet-stream'
const human = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

// a URL is disk-only (needs migrating) when it starts with one of these prefixes;
// map each to the disk dir its files live in
const SRC = [
  { prefix: '/uploads/', dir: UPLOAD_DIR },
  { prefix: '/images/', dir: IMAGE_DIR },
]
const localOf = (url) => (typeof url === 'string' ? SRC.find((s) => url.startsWith(s.prefix)) : null)

async function main() {
  if (!r2Configured()) {
    console.error('✗ R2 is not configured. Set R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET in server/.env.')
    process.exit(1)
  }
  if (!process.env.MONGODB_URI) {
    console.error('✗ MONGODB_URI is not set — nothing to rewrite. Add it to server/.env.')
    process.exit(1)
  }

  await connectDb()
  if (!dbReady()) {
    console.error('✗ Could not connect to MongoDB — check MONGODB_URI.')
    process.exit(1)
  }

  // 1) collect every disk-only URL the DB references, across all four collections
  const wanted = new Map() // basename -> { dir, prefix } (the file we must upload)
  const noteUrl = (url) => {
    const src = localOf(url)
    if (src) wanted.set(basename(url), src)
  }
  for (const d of await GeneratedModel.find({ modelUrl: { $regex: '^/uploads/' } }, 'modelUrl')) noteUrl(d.modelUrl)
  for (const d of await Post.find({ modelUrl: { $regex: '^/uploads/' } }, 'modelUrl')) noteUrl(d.modelUrl)
  for (const d of await Image.find({ url: { $regex: '^/images/' } }, 'url')) noteUrl(d.url)
  for (const d of await ModelVersionTree.find({
    $or: [{ rootModelUrl: { $regex: '^/uploads/' } }, { 'versions.modelUrl': { $regex: '^/uploads/' } }],
  })) {
    noteUrl(d.rootModelUrl)
    for (const v of d.versions || []) noteUrl(v.modelUrl)
  }

  // split into present-on-disk vs missing, and tally size
  const present = []
  const missing = []
  let bytes = 0
  for (const [name, src] of wanted) {
    const path = join(src.dir, name)
    if (existsSync(path)) {
      present.push(name)
      bytes += statSync(path).size
    } else {
      missing.push(name)
    }
  }

  console.log(`\nDB references ${wanted.size} disk-only files.`)
  console.log(`  • ${present.length} present on disk → upload to R2 (${human(bytes)})`)
  if (missing.length) console.log(`  • ${missing.length} referenced but MISSING on disk (left as-is): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`)
  console.log('')

  if (!GO) {
    console.log('DRY-RUN only — nothing uploaded or changed. Re-run with  --go  to apply.\n')
    await mongoose.disconnect()
    return
  }

  // 2) upload the referenced files; remember which basenames actually reached R2
  const uploaded = new Set()
  let done = 0
  for (const name of present) {
    const src = wanted.get(name)
    try {
      await putR2(name, readFileSync(join(src.dir, name)), mimeFor(name))
      uploaded.add(name)
    } catch (err) {
      console.warn(`  ! failed to upload ${name}: ${err.message}`)
    }
    if (++done % 20 === 0) console.log(`  …uploaded ${done}/${present.length}`)
  }
  console.log(`Uploaded ${uploaded.size}/${present.length} files to R2.\n`)

  // only rewrite a URL if its bytes are now in R2 (never mint a dead /files link)
  const next = (url) => {
    const src = localOf(url)
    return src && uploaded.has(basename(url)) ? `/files/${basename(url)}` : null
  }

  let genFixed = 0
  for (const doc of await GeneratedModel.find({ modelUrl: { $regex: '^/uploads/' } })) {
    const n = next(doc.modelUrl)
    if (n) { doc.modelUrl = n; await doc.save(); genFixed++ }
  }
  let postFixed = 0
  for (const doc of await Post.find({ modelUrl: { $regex: '^/uploads/' } })) {
    const n = next(doc.modelUrl)
    if (n) { doc.modelUrl = n; await doc.save(); postFixed++ }
  }
  let imgFixed = 0
  for (const doc of await Image.find({ url: { $regex: '^/images/' } })) {
    const n = next(doc.url)
    if (n) { doc.url = n; await doc.save(); imgFixed++ }
  }
  let treeFixed = 0
  for (const doc of await ModelVersionTree.find({
    $or: [{ rootModelUrl: { $regex: '^/uploads/' } }, { 'versions.modelUrl': { $regex: '^/uploads/' } }],
  })) {
    let changed = false
    const r = next(doc.rootModelUrl)
    if (r) { doc.rootModelUrl = r; changed = true }
    for (const v of doc.versions || []) {
      const nv = next(v.modelUrl)
      if (nv) { v.modelUrl = nv; changed = true }
    }
    if (changed) { doc.markModified('versions'); await doc.save(); treeFixed++ }
  }

  console.log('Rewrote DB URLs to /files/…:')
  console.log(`  • GeneratedModel (Library): ${genFixed}`)
  console.log(`  • Post (community):         ${postFixed}`)
  console.log(`  • Image:                    ${imgFixed}`)
  console.log(`  • Version trees:            ${treeFixed}\n`)
  console.log('✓ Done. These models/images now resolve from R2 for everyone on the same Atlas + R2.')
  await mongoose.disconnect()
}

main().catch(async (err) => {
  console.error('migration failed:', err)
  try {
    await mongoose.disconnect()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
