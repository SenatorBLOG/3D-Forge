import { Router } from 'express'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'

const router = Router()

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

// GET /api/models — most recent saved generations (empty without a DB)
router.get('/', async (req, res) => {
  if (!dbReady()) return res.json({ models: [], db: false })
  try {
    const models = await GeneratedModel.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json({ models, db: true })
  } catch (err) {
    console.error('models list failed:', err)
    res.status(500).json({ error: 'Failed to list models' })
  }
})

export default router
