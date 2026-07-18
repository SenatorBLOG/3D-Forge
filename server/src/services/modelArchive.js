import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { cloudFilesEnabled, saveCloudFile, openCloudFile } from './files.js'

// Model archiving (E4): provider (Meshy/Tripo) result URLs are signed and
// EXPIRE, and the browser can't fetch them cross-origin anyway (CORS). So when a
// task succeeds we download the GLB once and keep the bytes on OUR origin:
// GridFS (/files) when Mongo storage is on, local disk (/uploads) otherwise —
// so FILES_STORAGE=local still archives instead of leaking a CORS-blocked URL.
// Mock/local GLBs (not provider URLs) are returned untouched.

const UPLOAD_DIR = fileURLToPath(new URL('../../.devdata/uploads/', import.meta.url))

// host allow-list — we only ever fetch our generation providers' assets
const isProviderUrl = (url) => {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' &&
      /(^|\.)(meshy\.ai|tripo3d\.(ai|com))$/i.test(u.hostname)
    )
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
  // only remote provider URLs need archiving; local/mock URLs are already ours
  if (!modelUrl || !isProviderUrl(modelUrl)) return modelUrl
  const name = fileNameFor(taskId)

  if (inFlight.has(taskId)) return inFlight.get(taskId)
  const job = (async () => {
    const cloud = cloudFilesEnabled()
    // already archived on a previous poll → reuse
    if (cloud) {
      if (await openCloudFile(name)) return `/files/${name}`
    } else if (existsSync(join(UPLOAD_DIR, name))) {
      return `/uploads/${name}`
    }
    const res = await fetch(modelUrl)
    if (!res.ok) throw new Error(`model download ${res.status}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_GLB_BYTES) {
      throw new Error(`unexpected model size ${bytes.length}`)
    }
    if (bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
      throw new Error('downloaded file is not a binary GLB')
    }
    if (cloud) return saveCloudFile(name, bytes, 'model/gltf-binary')
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, name), bytes)
    return `/uploads/${name}`
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
