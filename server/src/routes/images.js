import express, { Router } from 'express'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { optionalAuth } from '../middleware/auth.js'
import { createImage, getImage, listVersions, readImageBytes, IMAGE_DIR } from '../services/images.js'
import { detectImage } from '../services/imageType.js'
import { isImageGenMock, generateImage, editImage } from '../services/imageGen.js'
import { cloudFilesEnabled, saveCloudFile } from '../services/files.js'

const router = Router()

// IMAGE_DIR is owned by the images service (it also reads files back for the
// real image→3D path); re-export so index.js can mount /images static from here.
export { IMAGE_DIR }

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const writeImageFile = (name, data) => {
  mkdirSync(IMAGE_DIR, { recursive: true })
  writeFileSync(join(IMAGE_DIR, name), data)
}

// One write path for image bytes: GridFS (shared, permanent) when Mongo is
// connected, local disk otherwise. Returns the public URL for the record.
async function storeImageBytes(name, data, mime) {
  if (cloudFilesEnabled()) return saveCloudFile(name, data, mime)
  writeImageFile(name, data)
  return `/images/${name}`
}

// POST /api/images — store a user-uploaded reference image. Body is the raw image
// bytes (Content-Type is ignored; we sniff the magic bytes). Returns the stored
// image record the Model step (B4) can consume by id.
router.post('/', optionalAuth, express.raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
  const body = req.body
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: 'send the image file as the raw request body' })
  }
  const kind = detectImage(body)
  if (!kind) {
    return res.status(400).json({ error: 'unsupported image (expected PNG, JPEG, GIF, or WEBP)' })
  }
  const id = newId()
  let url
  try {
    url = await storeImageBytes(`${id}.${kind.ext}`, body, kind.mime)
  } catch (err) {
    console.error('image upload write failed:', err)
    return res.status(500).json({ error: 'failed to store the image' })
  }
  try {
    const image = await createImage({
      id,
      url,
      source: 'upload',
      mime: kind.mime,
      ownerId: req.user?.id ?? null,
    })
    res.status(201).json({ image })
  } catch (err) {
    console.error('image record failed:', err)
    res.status(500).json({ error: 'failed to record the image' })
  }
})

const escapeXml = (s) =>
  s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c])

// A deterministic, dependency-free placeholder "render" of a prompt: an SVG card.
// Stands in for a real text→image model until one is wired (the real path will
// swap this for an actual generator while keeping the same response shape).
const stubImageSvg = (prompt) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1a1c22"/><stop offset="1" stop-color="#2b2f3a"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="256" cy="200" r="92" fill="none" stroke="#f5a623" stroke-width="6" opacity="0.85"/>
  <text x="256" y="430" fill="#cfd3dc" font-family="monospace" font-size="20" text-anchor="middle">${escapeXml(prompt.slice(0, 40))}</text>
  <text x="256" y="460" fill="#7a808c" font-family="monospace" font-size="13" text-anchor="middle">stub reference image</text>
</svg>`

// file extension for Gemini output: trust the magic bytes, fall back to mime
const extFor = (bytes, mime) =>
  detectImage(bytes)?.ext || (mime?.includes('jpeg') ? 'jpg' : mime?.includes('webp') ? 'webp' : 'png')

// Store freshly generated/edited image bytes + metadata; answers the request.
async function storeResult(res, { bytes, mime, prompt, source, ownerId, parentId = null }) {
  const id = newId()
  const ext = extFor(bytes, mime)
  const url = await storeImageBytes(`${id}.${ext}`, bytes, mime || `image/${ext}`)
  const image = await createImage({
    id,
    url,
    source,
    prompt,
    mime: mime || `image/${ext}`,
    ownerId,
    parentId,
  })
  res.status(201).json({ image, stub: false })
}

// POST /api/images/generate — text→image. With GEMINI_API_KEY set this is a
// real generation; key-free it falls back to the SVG placeholder so the whole
// pipeline still demos without credentials. Takes { prompt }; returns the same
// record shape as an upload so the Model step treats all images identically.
router.post('/generate', optionalAuth, async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
  if (!prompt) {
    return res.status(400).json({ error: 'prompt (non-empty string) is required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }
  const ownerId = req.user?.id ?? null

  if (!isImageGenMock()) {
    try {
      const { bytes, mime } = await generateImage(prompt)
      return await storeResult(res, { bytes, mime, prompt, source: 'generated', ownerId })
    } catch (err) {
      if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
      // upstream trouble (e.g. no image quota on this key) must not brick the
      // pipeline — log it and fall through to the placeholder path below
      console.error('image generation failed — falling back to stub:', err.message)
    }
  }

  // key-free fallback: deterministic SVG placeholder
  const id = newId()
  let url
  try {
    url = await storeImageBytes(`${id}.svg`, stubImageSvg(prompt), 'image/svg+xml')
  } catch (err) {
    console.error('image generate write failed:', err)
    return res.status(500).json({ error: 'failed to store the generated image' })
  }
  try {
    const image = await createImage({
      id,
      url,
      source: 'generated',
      prompt,
      mime: 'image/svg+xml',
      ownerId,
    })
    res.status(201).json({ image, stub: true })
  } catch (err) {
    console.error('generated image record failed:', err)
    res.status(500).json({ error: 'failed to record the generated image' })
  }
})

// POST /api/images/:id/edit — iterate on ONE image: { instruction } is applied
// to the CURRENT picture ("make the windows wider"), producing a new version
// linked to its parent via parentId. Key-free mode returns a labeled SVG stub
// so the loop is still demoable. The 3D step consumes any version's id as usual.
router.post('/:id/edit', optionalAuth, async (req, res) => {
  const instruction =
    typeof req.body?.instruction === 'string' ? req.body.instruction.trim() : ''
  if (!instruction) {
    return res.status(400).json({ error: 'instruction (non-empty string) is required' })
  }
  if (instruction.length > 600) {
    return res.status(400).json({ error: 'instruction must be 600 characters or fewer' })
  }
  const source = await getImage(req.params.id)
  if (!source) return res.status(404).json({ error: 'Unknown image id' })
  const ownerId = req.user?.id ?? null

  if (isImageGenMock()) {
    // key-free stub: a placeholder that at least shows the instruction
    const id = newId()
    try {
      const url = await storeImageBytes(`${id}.svg`, stubImageSvg(instruction), 'image/svg+xml')
      const image = await createImage({
        id,
        url,
        source: 'edited',
        prompt: instruction,
        mime: 'image/svg+xml',
        ownerId,
        parentId: source.id,
      })
      return res.status(201).json({ image, stub: true })
    } catch (err) {
      console.error('stub image edit failed:', err)
      return res.status(500).json({ error: 'failed to store the edited image' })
    }
  }

  try {
    const file = await readImageBytes(source)
    if (!file) return res.status(404).json({ error: 'image file not found' })
    const result = await editImage(file.bytes, file.mime || 'image/png', instruction)
    return await storeResult(res, {
      bytes: result.bytes,
      mime: result.mime,
      prompt: instruction,
      source: 'edited',
      ownerId,
      parentId: source.id,
    })
  } catch (err) {
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'image file not found' })
    console.error('image edit failed:', err)
    res.status(502).json({ error: 'Image edit service failed' })
  }
})

// GET /api/images/:id/versions — the whole edit family (root + all branches),
// oldest-first with 1-based `version` numbers. Feeds the Image Lab version cards
// so the client renders the loop with a single request.
router.get('/:id/versions', async (req, res) => {
  try {
    const result = await listVersions(req.params.id)
    if (!result) return res.status(404).json({ error: 'Unknown image id' })
    res.json(result)
  } catch (err) {
    console.error('list versions failed:', err)
    res.status(500).json({ error: 'failed to load image versions' })
  }
})

// GET /api/images/:id — resolve a stored image's metadata (used by the Model step)
router.get('/:id', async (req, res) => {
  try {
    const image = await getImage(req.params.id)
    if (!image) return res.status(404).json({ error: 'Unknown image id' })
    res.json({ image })
  } catch (err) {
    console.error('get image failed:', err)
    res.status(500).json({ error: 'failed to load the image' })
  }
})

export default router
