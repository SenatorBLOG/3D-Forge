import 'dotenv/config'
import { readdirSync, statSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import mongoose from 'mongoose'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { putR2, r2Configured } from '../src/services/r2.js'

// Audit R2 vs the DB + local disk, then (with --go) reclaim orphan disk files.
//   node scripts/audit-r2.mjs        # report only
//   node scripts/audit-r2.mjs --go   # + delete orphan local files (never referenced)
//
// Three questions:
//  1) INTEGRITY — is every /files/… the DB references actually present in R2?
//     (a missing one = a broken model/image for everyone). If a missing file is
//     still on local disk, re-upload it (repair).
//  2) ORPHANS — which local .devdata files are referenced by NOTHING? (~dead
//     weight from unsaved captures). --go deletes those.
//  3) never touches referenced files, R2 objects, or bundled /models.

const GO = process.argv.includes('--go')
const UPLOADS = fileURLToPath(new URL('../.devdata/uploads/', import.meta.url))
const IMAGES = fileURLToPath(new URL('../.devdata/images/', import.meta.url))
const human = (n) => (n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
const mimeFor = (n) =>
  n.endsWith('.glb') ? 'model/gltf-binary'
  : n.endsWith('.png') ? 'image/png'
  : /\.jpe?g$/.test(n) ? 'image/jpeg'
  : n.endsWith('.webp') ? 'image/webp'
  : 'application/octet-stream'

const listDir = (d) => {
  try {
    return readdirSync(d).filter((f) => {
      try { return statSync(join(d, f)).isFile() } catch { return false }
    })
  } catch { return [] }
}

// every R2 key, one paginated listing (fast — no HEAD-per-file)
async function listR2Keys() {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
  const keys = new Set()
  let token
  do {
    const out = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, ContinuationToken: token }))
    for (const o of out.Contents || []) keys.add(o.Key)
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return keys
}

async function main() {
  if (!r2Configured()) { console.error('✗ R2 not configured in server/.env'); process.exit(1) }
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db

  // every URL the DB references, by basename → where it lives
  const refFiles = new Map() // basename -> Set(prefix)  ('/files/','/uploads/','/images/')
  const note = (u) => {
    if (typeof u !== 'string') return
    const m = u.match(/^\/(files|uploads|images)\//)
    if (!m) return
    const b = basename(u)
    if (!refFiles.has(b)) refFiles.set(b, new Set())
    refFiles.get(b).add(m[1])
  }
  for (const d of await db.collection('generatedmodels').find({}, { projection: { modelUrl: 1 } }).toArray()) note(d.modelUrl)
  for (const d of await db.collection('posts').find({}, { projection: { modelUrl: 1 } }).toArray()) note(d.modelUrl)
  for (const d of await db.collection('images').find({}, { projection: { url: 1 } }).toArray()) note(d.url)
  for (const d of await db.collection('modelversiontrees').find({}).toArray()) {
    note(d.rootModelUrl)
    for (const v of d.versions || []) note(v.modelUrl)
  }

  // ALSO honour local-only stores (History, local version mirror, segment cache)
  // so deleting orphans can't break a card that lives only on this machine
  const devdata = fileURLToPath(new URL('../.devdata/', import.meta.url))
  const { readFileSync } = await import('node:fs')
  for (const f of listDir(devdata).filter((n) => n.endsWith('.json'))) {
    try {
      const txt = readFileSync(join(devdata, f), 'utf8')
      for (const m of txt.matchAll(/\/(files|uploads|images)\/([A-Za-z0-9][A-Za-z0-9._-]*)/g)) {
        const b = m[2]
        if (!refFiles.has(b)) refFiles.set(b, new Set())
        refFiles.get(b).add(m[1])
      }
    } catch { /* skip unreadable */ }
  }

  const r2 = await listR2Keys()
  console.log(`\nReferenced files in DB: ${refFiles.size}   |   objects in R2: ${r2.size}\n`)

  // 1) INTEGRITY: only /files/ references MUST be in R2 (they 404 for everyone if
  // absent). /uploads//images/ references are served from local disk, so they're
  // fine as long as the file is on disk — not a broken reference.
  const onDiskPath = (b) => [join(UPLOADS, b), join(IMAGES, b)].find((p) => { try { return statSync(p).isFile() } catch { return false } }) || null
  const missing = []
  for (const [b, prefixes] of refFiles) {
    if (r2.has(b)) continue
    if (!prefixes.has('files')) continue // /uploads|/images serve from disk — not an R2 gap
    missing.push({ b, prefixes: [...prefixes], onDisk: onDiskPath(b) })
  }
  const lost = missing.filter((m) => !m.onDisk)
  console.log(`INTEGRITY — /files/ references missing from R2: ${missing.length} (${missing.length - lost.length} recoverable from disk, ${lost.length} LOST)`)
  for (const m of missing.slice(0, 20)) console.log(`  • ${m.b} ${m.onDisk ? '→ recoverable (re-upload)' : '→ LOST (gone everywhere)'}`)
  if (missing.length > 20) console.log(`  …and ${missing.length - 20} more`)

  // 2) ORPHANS: local disk files referenced by nothing
  const uploads = listDir(UPLOADS).map((n) => ({ n, dir: UPLOADS }))
  const images = listDir(IMAGES).map((n) => ({ n, dir: IMAGES }))
  const orphans = []
  let orphanBytes = 0
  for (const f of [...uploads, ...images]) {
    if (refFiles.has(f.n)) continue // referenced (any prefix) → keep
    const size = statSync(join(f.dir, f.n)).size
    orphans.push({ ...f, size })
    orphanBytes += size
  }
  console.log(`\nORPHANS — local files referenced by nothing: ${orphans.length} (${human(orphanBytes)})`)

  if (!GO) {
    console.log('\nDRY-RUN. Re-run with --go to: re-upload recoverable missing files + delete orphans.\n')
    await mongoose.disconnect()
    return
  }

  // repair: re-upload any missing file we still have on disk
  let repaired = 0
  for (const m of missing) {
    if (!m.onDisk) continue
    try { await putR2(m.b, (await import('node:fs')).readFileSync(m.onDisk), mimeFor(m.b)); repaired++ }
    catch (e) { console.warn(`  ! repair failed ${m.b}: ${e.message}`) }
  }
  // delete orphans
  let deleted = 0
  let freed = 0
  for (const o of orphans) {
    try { rmSync(join(o.dir, o.n), { force: true }); deleted++; freed += o.size }
    catch (e) { console.warn(`  ! delete failed ${o.n}: ${e.message}`) }
  }
  console.log(`\n✓ Repaired (re-uploaded to R2): ${repaired}`)
  console.log(`✓ Deleted orphan local files: ${deleted} (${human(freed)} reclaimed)`)
  console.log(`  Still LOST (missing from R2 AND disk): ${missing.filter((m) => !m.onDisk).length}`)
  await mongoose.disconnect()
}

main().catch(async (e) => { console.error(e); try { await mongoose.disconnect() } catch {} process.exit(1) })
