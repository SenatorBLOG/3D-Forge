import express, { Router } from 'express'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { recordTask, updateTask } from '../services/history.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { listLibrary } from '../services/library.js'
import { toggleFavorite } from '../services/favorites.js'

const router = Router()

// where uploaded .glb files live (gitignored, alongside the dev store)
export const UPLOAD_DIR = fileURLToPath(new URL('../../.devdata/uploads/', import.meta.url))

// POST /api/models/upload — store a user-uploaded .glb and record it in history
// so it persists and reloads via the History "Load" button. Body is the raw
// file bytes (Content-Type ignored); ?name=<label> sets the history title.
router.post('/upload', optionalAuth, express.raw({ type: '*/*', limit: '60mb' }), (req, res) => {
  const body = req.body
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: 'send the .glb file as the raw request body' })
  }
  if (body.subarray(0, 4).toString('ascii') !== 'glTF') {
    return res.status(400).json({ error: 'not a valid binary .glb (missing glTF header)' })
  }
  const label = String(req.query.name || 'Uploaded model')
    .replace(/[^\w .-]+/g, '_')
    .slice(0, 60)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    writeFileSync(join(UPLOAD_DIR, `${id}.glb`), body)
  } catch (err) {
    console.error('model upload write failed:', err)
    return res.status(500).json({ error: 'failed to store the uploaded model' })
  }
  const url = `/uploads/${id}.glb`
  const taskId = `upload-${id}`
  // mirror a finished generation so it shows as a History card with Load/Download
  recordTask({ kind: 'generate', taskId, prompt: label, mock: true, ownerId: req.user?.id ?? null })
  updateTask(taskId, 'SUCCEEDED', url)
  res.status(201).json({ url, taskId })
})

// GET /api/models/proxy?url=... — same-origin proxy for Meshy's GLB assets.
// The browser's GLTFLoader can't fetch https://assets.meshy.ai/... directly
// (no CORS headers), so we fetch it server-side and stream it back. Locked to
// meshy.ai hosts to avoid being an open proxy.
router.get('/proxy', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : ''
  let host
  try {
    host = new URL(url).hostname
  } catch {
    return res.status(400).json({ error: 'a valid url is required' })
  }
  if (!/^https:$/.test(new URL(url).protocol) || !/(^|\.)meshy\.ai$/i.test(host)) {
    return res.status(400).json({ error: 'only https meshy.ai asset URLs are allowed' })
  }
  try {
    const upstream = await fetch(url)
    if (!upstream.ok) {
      return res.status(502).json({ error: `upstream returned ${upstream.status}` })
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'model/gltf-binary')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch (err) {
    console.error('model proxy failed:', err)
    res.status(502).json({ error: 'failed to fetch the model' })
  }
})

// GET /api/models — the generations library (works in mock mode AND with Mongo).
// Query: ?owner=me|all (default all) · ?filter=favorites · ?q=<prompt search>
//        ?limit=<1..100, default 20> · ?offset=<n>
// owner=me / filter=favorites need a signed-in user (401 otherwise).
router.get('/', optionalAuth, async (req, res) => {
  const owner = req.query.owner === 'me' ? 'me' : 'all'
  const onlyFavorites = req.query.filter === 'favorites'
  if ((owner === 'me' || onlyFavorites) && !req.user) {
    return res.status(401).json({ error: 'Sign in to view your library' })
  }
  try {
    const { models, total } = await listLibrary({
      userId: req.user?.id ?? null,
      owner,
      onlyFavorites,
      q: typeof req.query.q === 'string' ? req.query.q : '',
      limit: req.query.limit,
      offset: req.query.offset,
    })
    res.json({ models, total })
  } catch (err) {
    console.error('models list failed:', err)
    res.status(500).json({ error: 'Failed to list models' })
  }
})

// POST /api/models/:taskId/favorite — star/unstar a library model (auth required)
router.post('/:taskId/favorite', requireAuth, async (req, res) => {
  try {
    res.json(await toggleFavorite(req.user.id, req.params.taskId))
  } catch (err) {
    console.error('toggle favorite failed:', err)
    res.status(500).json({ error: 'Failed to update favorite' })
  }
})

export default router
