import { toLoadableUrl } from './modelUrl.js'

// Turn a label into a safe .glb filename.
function safeName(label) {
  const base = String(label || 'model')
    .trim()
    .replace(/[^\w .-]+/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'model'
  return base.toLowerCase().endsWith('.glb') ? base : `${base}.glb`
}

/**
 * Fetch a model's GLB bytes (via the same-origin proxy for remote URLs) and
 * trigger a browser "Save as…" download. Works for /models, /uploads, /files
 * and Meshy asset URLs alike.
 */
export async function downloadModel(modelUrl, label) {
  const res = await fetch(toLoadableUrl(modelUrl))
  if (!res.ok) throw new Error(`Couldn't fetch the model (HTTP ${res.status})`)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = safeName(label)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}
