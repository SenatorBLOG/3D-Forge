import express, { Router } from 'express'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { optionalAuth } from '../middleware/auth.js'
import { createImage, getImage } from '../services/images.js'
import { detectImage } from '../services/imageType.js'

const router = Router()

// where reference images live (gitignored, alongside the dev store + uploads)
export const IMAGE_DIR = fileURLToPath(new URL('../../.devdata/images/', import.meta.url))

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const writeImageFile = (name, data) => {
  mkdirSync(IMAGE_DIR, { recursive: true })
  writeFileSync(join(IMAGE_DIR, name), data)
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
  try {
    writeImageFile(`${id}.${kind.ext}`, body)
  } catch (err) {
    console.error('image upload write failed:', err)
    return res.status(500).json({ error: 'failed to store the image' })
  }
  const url = `/images/${id}.${kind.ext}`
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

// POST /api/images/generate — stubbed text→image generator. Takes { prompt },
// "renders" a placeholder reference image, stores it, and returns the same record
// shape as an upload so the Model step treats both identically.
router.post('/generate', optionalAuth, async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
  if (!prompt) {
    return res.status(400).json({ error: 'prompt (non-empty string) is required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }
  const id = newId()
  try {
    writeImageFile(`${id}.svg`, stubImageSvg(prompt))
  } catch (err) {
    console.error('image generate write failed:', err)
    return res.status(500).json({ error: 'failed to store the generated image' })
  }
  try {
    const image = await createImage({
      id,
      url: `/images/${id}.svg`,
      source: 'generated',
      prompt,
      mime: 'image/svg+xml',
      ownerId: req.user?.id ?? null,
    })
    res.status(201).json({ image, stub: true })
  } catch (err) {
    console.error('generated image record failed:', err)
    res.status(500).json({ error: 'failed to record the generated image' })
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
