import express, { Router } from 'express'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { recordTask, updateTask } from '../services/history.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { listLibrary } from '../services/library.js'
import { toggleFavorite } from '../services/favorites.js'
import { cloudFilesEnabled, saveCloudFile } from '../services/files.js'
import { resolveLocalModel, localModelExists, glbToObj, glbToStl } from '../services/convert.js'

const router = Router()

// where uploaded .glb files live (gitignored, alongside the dev store)
export const UPLOAD_DIR = fileURLToPath(new URL('../../.devdata/uploads/', import.meta.url))

// POST /api/models/upload — store a user-uploaded .glb and record it in history
// so it persists and reloads via the History "Load" button. Body is the raw
// file bytes (Content-Type ignored); ?name=<label> sets the history title.
router.post('/upload', optionalAuth, express.raw({ type: '*/*', limit: '60mb' }), async (req, res) => {
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
  let url
  try {
    if (cloudFilesEnabled()) {
      // E4: shared, permanent storage — teammates on the same DB see the file
      url = await saveCloudFile(`upload-${id}.glb`, body, 'model/gltf-binary')
    } else {
      mkdirSync(UPLOAD_DIR, { recursive: true })
      writeFileSync(join(UPLOAD_DIR, `${id}.glb`), body)
      url = `/uploads/${id}.glb`
    }
  } catch (err) {
    console.error('model upload write failed:', err)
    return res.status(500).json({ error: 'failed to store the uploaded model' })
  }
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

// GET /api/models/convert?src=<path>&format=<glb|obj|stl> — download a local
// model in another format. `src` must be a bundled /models/*.glb or a stored
// /uploads/*.glb — anything else (remote URLs, traversal) is rejected with 400,
// so this can never be used as an open proxy/SSRF vector. FBX is out of scope
// (needs external tooling). Pure conversion: no keys, no DB, mock-agnostic.
const CONVERT_TYPES = {
  glb: 'model/gltf-binary',
  obj: 'model/obj',
  stl: 'model/stl',
}

router.get('/convert', async (req, res) => {
  const src = typeof req.query.src === 'string' ? req.query.src : ''
  const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : ''
  const filePath = resolveLocalModel(src)
  if (!filePath) {
    return res.status(400).json({ error: 'src must be a local /models or /uploads .glb path' })
  }
  if (!(format in CONVERT_TYPES)) {
    return res.status(400).json({ error: 'format must be one of: glb, obj, stl' })
  }
  if (!localModelExists(filePath)) {
    return res.status(404).json({ error: 'model file not found' })
  }
  const name = basename(filePath, '.glb')
  let bytes
  try {
    bytes = readFileSync(filePath)
  } catch (err) {
    console.error('convert read failed:', err)
    return res.status(500).json({ error: 'failed to read the model' })
  }
  res.setHeader('Content-Disposition', `attachment; filename="${name}.${format}"`)
  if (format === 'glb') {
    res.setHeader('Content-Type', CONVERT_TYPES.glb)
    return res.send(bytes)
  }
  try {
    const text = format === 'obj' ? await glbToObj(bytes) : await glbToStl(bytes)
    res.setHeader('Content-Type', CONVERT_TYPES[format])
    res.send(text)
  } catch (err) {
    console.error('model conversion failed:', err)
    res.status(422).json({ error: 'could not convert this model (unsupported GLB features)' })
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
