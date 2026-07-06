import { cloudFilesEnabled, saveCloudFile, openCloudFile } from './files.js'

// Model archiving (E4): Meshy's result URLs are signed and EXPIRE after a
// while, so a finished generation would eventually 404 for everyone. When a
// task succeeds we download the GLB once and keep the bytes in GridFS next to
// the rest of our data; records then point at our permanent /files URL.
// Key-free/mock results (bundled local GLBs) and disk-only mode are untouched.

// same host allow-list as the /proxy route — we only ever fetch Meshy assets
const isMeshyUrl = (url) => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)meshy\.ai$/i.test(u.hostname)
  } catch {
    return false
  }
}

const MAX_GLB_BYTES = 100 * 1024 * 1024 // sanity cap; refine GLBs are ~10-30MB

const fileNameFor = (taskId) => `model-${String(taskId).replace(/[^A-Za-z0-9._-]/g, '_')}.glb`

// avoid re-downloading when several pollers race the same finished task
const inFlight = new Map() // taskId -> Promise<string archived url>

/**
 * Ensure a finished model is safely stored. Returns the URL records should
 * keep: the permanent /files URL when archiving applies, otherwise the input
 * unchanged (mock/local URLs, disk-only mode, or a failed download — the
 * original URL still works for now, so never break the response over this).
 */
export async function archiveModelUrl(taskId, modelUrl) {
  if (!modelUrl || !cloudFilesEnabled() || !isMeshyUrl(modelUrl)) return modelUrl
  const name = fileNameFor(taskId)

  if (inFlight.has(taskId)) return inFlight.get(taskId)
  const job = (async () => {
    // already archived on a previous poll → reuse
    if (await openCloudFile(name)) return `/files/${name}`
    const res = await fetch(modelUrl)
    if (!res.ok) throw new Error(`model download ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_GLB_BYTES) {
      throw new Error(`unexpected model size ${bytes.length}`)
    }
    if (bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw new Error('downloaded file is not a binary GLB')
    }
    return saveCloudFile(name, bytes, 'model/gltf-binary')
  })()
    .catch((err) => {
      console.error(`model archive failed for ${taskId}:`, err.message)
      return modelUrl // best-effort: the signed URL still works for a while
    })
    .finally(() => {
      // allow a retry on a later poll if this attempt failed
      setTimeout(() => inFlight.delete(taskId), 5000).unref?.()
    })
  inFlight.set(taskId, job)
  return job
}
