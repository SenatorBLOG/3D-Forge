// One-off GridFS maintenance for the shared Atlas DB.
//   node gridfs-clean.mjs                 → ANALYZE only (no deletes)
//   node gridfs-clean.mjs --keep-days=N   → delete files older than N days
//   node gridfs-clean.mjs --before=ISO    → delete files uploaded before a date
// MONGODB_URI must be passed in the environment.
import mongoose from 'mongoose'

const URI = process.env.MONGODB_URI
if (!URI) {
  console.error('MONGODB_URI not set')
  process.exit(1)
}

const args = process.argv.slice(2)
const keepDays = Number((args.find((a) => a.startsWith('--keep-days=')) || '').split('=')[1])
const beforeArg = (args.find((a) => a.startsWith('--before=')) || '').split('=')[1]
const doDelete = Number.isFinite(keepDays) || !!beforeArg

const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB'

await mongoose.connect(URI)
const db = mongoose.connection.db
const filesCol = db.collection('files.files')
const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'files' })

const all = await filesCol.find({}).project({ length: 1, uploadDate: 1, filename: 1 }).toArray()
const totalBytes = all.reduce((s, f) => s + (f.length || 0), 0)
console.log(`\nfiles.files: ${all.length} files, total ${mb(totalBytes)}`)

// age buckets
const now = Date.now()
const day = 86400000
const buckets = [
  ['> 30 days', (d) => d > 30 * day],
  ['14–30 days', (d) => d > 14 * day && d <= 30 * day],
  ['7–14 days', (d) => d > 7 * day && d <= 14 * day],
  ['< 7 days', (d) => d <= 7 * day],
]
console.log('\nby age:')
for (const [label, test] of buckets) {
  const g = all.filter((f) => test(now - new Date(f.uploadDate).getTime()))
  const b = g.reduce((s, f) => s + (f.length || 0), 0)
  console.log(`  ${label.padEnd(12)} ${String(g.length).padStart(4)} files  ${mb(b).padStart(12)}`)
}

// by type (models = .glb, images = the rest)
const glb = all.filter((f) => (f.filename || '').toLowerCase().endsWith('.glb'))
const glbBytes = glb.reduce((s, f) => s + (f.length || 0), 0)
console.log(`\nby type:`)
console.log(`  .glb models  ${String(glb.length).padStart(4)} files  ${mb(glbBytes).padStart(12)}`)
console.log(`  other/images ${String(all.length - glb.length).padStart(4)} files  ${mb(totalBytes - glbBytes).padStart(12)}`)

const dates = all.map((f) => new Date(f.uploadDate).getTime()).sort((a, b) => a - b)
if (dates.length) {
  console.log(`\noldest: ${new Date(dates[0]).toISOString()}`)
  console.log(`newest: ${new Date(dates[dates.length - 1]).toISOString()}`)
}

if (doDelete) {
  const cutoff = beforeArg ? new Date(beforeArg) : new Date(now - keepDays * day)
  const victims = all.filter((f) => new Date(f.uploadDate) < cutoff)
  const freed = victims.reduce((s, f) => s + (f.length || 0), 0)
  console.log(`\n=== DELETING ${victims.length} files uploaded before ${cutoff.toISOString()} (frees ${mb(freed)}) ===`)
  let done = 0
  for (const f of victims) {
    try {
      await bucket.delete(f._id)
      done++
    } catch (e) {
      console.error('  failed to delete', f.filename, e.message)
    }
  }
  console.log(`deleted ${done}/${victims.length} files`)
  const after = await filesCol.find({}).project({ length: 1 }).toArray()
  console.log(`remaining: ${after.length} files, ${mb(after.reduce((s, f) => s + (f.length || 0), 0))}`)
} else {
  console.log('\n(analyze only — pass --keep-days=N or --before=ISO to delete)')
}

await mongoose.disconnect()
