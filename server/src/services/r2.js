import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

// Cloudflare R2 object storage (S3-compatible). Big file bytes (GLBs, images)
// live here instead of GridFS/Atlas, so the DB isn't the storage bottleneck and
// teammates share the same files. Enabled by FILES_STORAGE=r2 + the R2_* env
// vars. Egress is free on R2, so serving through our /files proxy is fine.

const BUCKET = () => process.env.R2_BUCKET
const accountId = () => process.env.R2_ACCOUNT_ID

export const r2Configured = () =>
  !!(accountId() && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && BUCKET())

export const r2Enabled = () =>
  (process.env.FILES_STORAGE || '').toLowerCase() === 'r2' && r2Configured()

let client = null
const s3 = () => {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return client
}

/** Store bytes in R2 under `key`. */
export async function putR2(key, bytes, mime) {
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
      ContentType: mime || 'application/octet-stream',
    }),
  )
}

/** Open a download stream for the route layer; null if the object is missing. */
export async function getR2(key) {
  try {
    const out = await s3().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }))
    return {
      stream: out.Body, // a Node Readable
      contentType: out.ContentType || 'application/octet-stream',
      length: out.ContentLength,
    }
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') return null
    throw err
  }
}

/** Read an object fully into a Buffer, or null if missing. */
export async function readR2(key) {
  const found = await getR2(key)
  if (!found) return null
  const chunks = []
  for await (const chunk of found.stream) chunks.push(chunk)
  return { bytes: Buffer.concat(chunks), mime: found.contentType }
}
