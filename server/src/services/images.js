import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { dbReady } from '../db.js'
import Image from '../models/Image.js'
import { load, flush } from './persistence.js'

// where reference image bytes live (gitignored, alongside the dev store). The
// route writes here; this module reads back for the real image→3D path.
export const IMAGE_DIR = fileURLToPath(new URL('../../.devdata/images/', import.meta.url))

// Reference-image metadata store for the Image → Model pipeline. In-memory when
// no Mongo (keyless dev), Mongo when connected — same dual-store pattern as the
// rest of the project. The image bytes themselves live on disk (routes/images.js
// writes them under .devdata/images); this only tracks the metadata so the Model
// step (B4) can resolve an imageId back to its URL/owner.

const MAX = 500
const memImages = new Map() // imageId -> record (insertion order ~ newest last)

// Hydrate from the dev file (no-op under Mongo/tests). Stored as a plain
// { images: { imageId: record } } object.
{
  const saved = load('images', null)
  if (saved) {
    for (const [id, rec] of Object.entries(saved.images || {})) memImages.set(id, rec)
  }
}

const saveImages = () => {
  const images = {}
  for (const [id, rec] of memImages) images[id] = rec
  flush('images', { images })
}

const publicImage = (r) => ({
  id: r.imageId ?? r.id,
  url: r.url,
  source: r.source,
  prompt: r.prompt || '',
  mime: r.mime || '',
  ownerId: r.ownerId ?? null,
  createdAt: r.createdAt,
})

/** Persist an image's metadata. `id` is the caller-chosen filename stem. */
export async function createImage({ id, url, source, prompt = '', mime = '', ownerId = null }) {
  const base = { imageId: id, url, source, prompt, mime, ownerId }
  if (dbReady()) {
    const doc = await Image.create(base)
    return publicImage({ ...base, createdAt: doc.createdAt })
  }
  const rec = { ...base, createdAt: new Date().toISOString() }
  memImages.set(id, rec)
  // cap the metadata index so a long dev session's map doesn't grow unbounded,
  // and delete the evicted image's bytes too so disk usage stays bounded.
  if (memImages.size > MAX) {
    const oldestId = memImages.keys().next().value
    const evicted = memImages.get(oldestId)
    memImages.delete(oldestId)
    if (evicted?.url) {
      try {
        rmSync(join(IMAGE_DIR, basename(evicted.url)), { force: true })
      } catch (err) {
        console.error('evicted image cleanup failed:', err)
      }
    }
  }
  saveImages()
  return publicImage(rec)
}

/** Resolve an imageId to its metadata, or null if unknown. */
export async function getImage(id) {
  if (dbReady()) {
    const doc = await Image.findOne({ imageId: id }).lean()
    return doc ? publicImage(doc) : null
  }
  const rec = memImages.get(id)
  return rec ? publicImage(rec) : null
}

/**
 * Read a stored image back as a base64 data URI. Meshy's image-to-3D can't
 * reach our localhost `/images` URLs, so the real pipeline inlines the bytes.
 * Returns null if the image (record or file) is missing.
 */
export async function imageDataUri(id) {
  const rec = await getImage(id)
  if (!rec) return null
  try {
    const bytes = readFileSync(join(IMAGE_DIR, basename(rec.url)))
    return `data:${rec.mime || 'application/octet-stream'};base64,${bytes.toString('base64')}`
  } catch (err) {
    console.error('image read failed:', err)
    return null
  }
}

/** A user's images, newest-first (for a future "my references" view). */
export async function listImages(ownerId, limit = 50) {
  if (dbReady()) {
    const docs = await Image.find({ ownerId }).sort({ createdAt: -1 }).limit(limit).lean()
    return docs.map(publicImage)
  }
  // the Map preserves insertion order (oldest-first) — reverse for newest-first.
  // Deterministic even when createdAt ties to the same millisecond.
  return [...memImages.values()]
    .filter((r) => r.ownerId === ownerId)
    .reverse()
    .slice(0, limit)
    .map(publicImage)
}
