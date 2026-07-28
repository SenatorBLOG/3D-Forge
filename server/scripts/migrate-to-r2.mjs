/**
 * Migrate legacy local files to Cloudflare R2.
 *
 * Old models/images were stored on local disk (/uploads/*, /images/*) — so the
 * DB doc is shared via Atlas, but the bytes only exist on the machine that made
 * them. This uploads THIS machine's local files to R2 and rewrites the matching
 * DB URLs to /files/<name> (served from R2, shared by everyone). Files this
 * machine doesn't have are left alone — the teammate who has them runs it too.
 *
 * Safe: dry-run by default (prints what it WOULD do). Add --go to apply.
 * Idempotent: already-migrated (/files/…) URLs are skipped.
 *
 *   node scripts/migrate-to-r2.mjs         # dry run (no writes)
 *   node scripts/migrate-to-r2.mjs --go    # apply
 *
 * Run it from the server/ directory so server/.env (Mongo + R2) is loaded.
 */
import 'dotenv/config'
import mongoose from 'mongoose'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { putR2, r2Enabled } from '../src/services/r2.js'

const APPLY = process.argv.includes('--go')
const UPLOADS = fileURLToPath(new URL('../.devdata/uploads/', import.meta.url))
const IMAGES = fileURLToPath(new URL('../.devdata/images/', import.meta.url))

const LOCAL = /^\/(uploads|images)\//
const mimeFor = (n) =>
  n.endsWith('.glb') ? 'model/gltf-binary'
  : n.endsWith('.png') ? 'image/png'
  : /\.jpe?g$/.test(n) ? 'image/jpeg'
  : n.endsWith('.webp') ? 'image/webp'
  : n.endsWith('.gif') ? 'image/gif'
  : 'application/octet-stream'

const diskPath = (url) => {
  const name = basename(url)
  if (url.startsWith('/uploads/')) return { name, path: join(UPLOADS, name) }
  if (url.startsWith('/images/')) return { name, path: join(IMAGES, name) }
  return null
}

// upload one local file to R2 (once — cached by name). Returns the /files/ URL,
// or null if the file isn't on THIS machine.
const uploaded = new Map() // name -> /files/name (avoid re-uploading shared names)
async function pushToR2(url, stats) {
  const lp = diskPath(url)
  if (!lp) return null
  if (uploaded.has(lp.name)) return uploaded.get(lp.name)
  if (!existsSync(lp.path)) {
    stats.missingLocal++
    return null
  }
  const dest = `/files/${lp.name}`
  if (APPLY) await putR2(lp.name, readFileSync(lp.path), mimeFor(lp.name))
  uploaded.set(lp.name, dest)
  stats.uploaded++
  return dest
}

// flat collection: one string field holds the URL
async function migrateFlat(db, coll, field, stats) {
  const cursor = db.collection(coll).find({ [field]: { $regex: '^/(uploads|images)/' } })
  for await (const doc of cursor) {
    stats.candidates++
    const dest = await pushToR2(doc[field], stats)
    if (!dest) continue
    if (APPLY) await db.collection(coll).updateOne({ _id: doc._id }, { $set: { [field]: dest } })
    stats.rewritten++
  }
}

// version trees: rootModelUrl + every versions[].modelUrl
async function migrateTrees(db, stats) {
  const cursor = db.collection('modelversiontrees').find({
    $or: [{ rootModelUrl: { $regex: '^/(uploads|images)/' } }, { 'versions.modelUrl': { $regex: '^/(uploads|images)/' } }],
  })
  for await (const doc of cursor) {
    let changed = false
    const set = {}
    if (LOCAL.test(doc.rootModelUrl || '')) {
      stats.candidates++
      const d = await pushToR2(doc.rootModelUrl, stats)
      if (d) { set.rootModelUrl = d; stats.rewritten++; changed = true }
    }
    const versions = doc.versions || []
    for (let i = 0; i < versions.length; i++) {
      if (!LOCAL.test(versions[i].modelUrl || '')) continue
      stats.candidates++
      const d = await pushToR2(versions[i].modelUrl, stats)
      if (d) { set[`versions.${i}.modelUrl`] = d; stats.rewritten++; changed = true }
    }
    if (changed && APPLY) await db.collection('modelversiontrees').updateOne({ _id: doc._id }, { $set: set })
  }
}

async function main() {
  if (!r2Enabled()) {
    console.error('R2 not enabled. Need FILES_STORAGE=r2 + R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET in server/.env.')
    process.exit(1)
  }
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  console.log(APPLY ? '=== APPLYING (uploading to R2 + rewriting Atlas URLs) ===' : '=== DRY RUN — no writes. Re-run with --go to apply. ===')

  const stats = { candidates: 0, uploaded: 0, rewritten: 0, missingLocal: 0 }
  await migrateFlat(db, 'generatedmodels', 'modelUrl', stats)
  await migrateFlat(db, 'posts', 'modelUrl', stats)
  await migrateFlat(db, 'images', 'url', stats)
  await migrateTrees(db, stats)

  console.log('\nResult:')
  console.log('  local URLs found (candidates):', stats.candidates)
  console.log('  files uploaded to R2 (unique) :', uploaded.size, APPLY ? '' : '(dry run — not actually uploaded)')
  console.log('  DB URLs rewritten to /files/  :', stats.rewritten, APPLY ? '' : '(dry run — not actually written)')
  console.log('  skipped (file not on THIS PC) :', stats.missingLocal, '→ a teammate runs this to migrate those')
  await mongoose.disconnect()
  console.log(APPLY ? '\nDone. New /files/ URLs are served from R2 (shared).' : '\nDry run done. Add --go to apply.')
}
main().catch((e) => { console.error(e); process.exit(1) })
