import mongoose from 'mongoose'
import { Readable } from 'node:stream'
import { dbReady } from '../db.js'

// Cloud file storage (E3): when Mongo/Atlas is connected, image and model
// bytes live in GridFS — the same database as the rest of our data — so any
// teammate pointing at the same MONGODB_URI sees the same files, and nothing
// is lost when a laptop dies. Key-free/mock mode keeps the existing local-disk
// behavior (routes fall back on their own), so the demo still runs offline.

const BUCKET = 'files'

let bucket = null
const getBucket = () => {
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET })
  return bucket
}

/** Whether cloud file storage is active (Mongo connected). */
export const cloudFilesEnabled = () => dbReady()

// GridFS filenames come from our own generated ids, but validate anyway so a
// crafted name can never traverse or collide weirdly.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
export const isSafeFileName = (name) =>
  typeof name === 'string' && name.length <= 120 && SAFE_NAME.test(name)

/**
 * Store bytes under `filename`; returns the public URL (/files/<name>).
 * Overwrites nothing — our ids are unique by construction.
 */
export async function saveCloudFile(filename, bytes, mime) {
  if (!isSafeFileName(filename)) throw new Error(`unsafe filename: ${filename}`)
  await new Promise((resolve, reject) => {
    // the modern driver dropped the top-level contentType option — carry the
    // mime in metadata so downloads can restore the right Content-Type
    const up = getBucket().openUploadStream(filename, {
      metadata: { mime: mime || 'application/octet-stream' },
    })
    Readable.from(bytes).pipe(up).on('finish', resolve).on('error', reject)
  })
  return `/files/${filename}`
}

const mimeOf = (fileDoc) =>
  fileDoc.metadata?.mime || fileDoc.contentType || 'application/octet-stream'

/** Read a stored file fully into a Buffer, or null if missing. */
export async function readCloudFile(filename) {
  if (!isSafeFileName(filename)) return null
  const found = await getBucket().find({ filename }).limit(1).toArray()
  if (!found.length) return null
  const chunks = []
  await new Promise((resolve, reject) => {
    getBucket()
      .openDownloadStreamByName(filename)
      .on('data', (c) => chunks.push(c))
      .on('end', resolve)
      .on('error', reject)
  })
  return { bytes: Buffer.concat(chunks), mime: mimeOf(found[0]) }
}

/** Open a download stream for the route layer; null if missing. */
export async function openCloudFile(filename) {
  if (!isSafeFileName(filename)) return null
  const found = await getBucket().find({ filename }).limit(1).toArray()
  if (!found.length) return null
  return {
    stream: getBucket().openDownloadStreamByName(filename),
    contentType: mimeOf(found[0]),
    length: found[0].length,
  }
}
