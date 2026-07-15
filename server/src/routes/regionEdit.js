import { Router } from 'express'
import { segmentModel, hitTestPart, partSwap, extractPart, stitchPart } from '../services/segment.js'
import { optionalAuth } from '../middleware/auth.js'
import { recordTask, updateTask } from '../services/history.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'

const router = Router()

// POST /api/edit/segment { modelUrl } — split a model into named parts (cached).
// → { modelUrl, parts: [{ id, name, index, bbox, center }], cached }
router.post('/segment', async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' })
  try {
    res.json(await segmentModel(modelUrl))
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('segment failed:', err)
    res.status(500).json({ error: 'Failed to segment model' })
  }
})

// POST /api/edit/locate { modelUrl, point:{x,y,z} } — which part a spatial point
// hits (segments on demand, cached). → { part } or { part: null }
router.post('/locate', async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const point = req.body?.point
  if (!modelUrl || !point) return res.status(400).json({ error: 'modelUrl and point are required' })
  try {
    const { parts } = await segmentModel(modelUrl)
    res.json({ part: hitTestPart(parts, point) })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('locate failed:', err)
    res.status(500).json({ error: 'Failed to locate part' })
  }
})

// POST /api/edit/partswap { modelUrl, point?|partId?, instruction? } — regenerate
// (mock: replace with a primitive) just the pointed/chosen part; returns a new
// stored model. → { modelUrl, swappedPart, instruction }
router.post('/partswap', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const point = req.body?.point
  const partId = typeof req.body?.partId === 'string' ? req.body.partId : ''
  const instruction = typeof req.body?.instruction === 'string' ? req.body.instruction.slice(0, 600) : ''
  if (!modelUrl || (!point && !partId)) {
    return res.status(400).json({ error: 'modelUrl and one of point / partId are required' })
  }
  try {
    const { parts } = await segmentModel(modelUrl)
    const part = partId ? parts.find((p) => p.id === partId) : hitTestPart(parts, point)
    if (!part) return res.status(404).json({ error: 'no matching part for the given point/partId' })
    const result = await partSwap(modelUrl, part)

    // mirror a finished generation so the swap lands in History + Library
    const label = `part-swap: ${part.name}${instruction ? ` — ${instruction}` : ''}`.slice(0, 120)
    const taskId = `partswap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    recordTask({ kind: 'generate', taskId, prompt: label, mock: true, ownerId: req.user?.id ?? null })
    updateTask(taskId, 'SUCCEEDED', result.modelUrl)
    if (dbReady()) {
      try {
        await GeneratedModel.create({
          prompt: label,
          meshyTaskId: taskId,
          status: 'SUCCEEDED',
          modelUrl: result.modelUrl,
          mock: true,
          ownerId: req.user?.id ?? null,
        })
      } catch (err) {
        console.error('partswap library record failed:', err)
      }
    }

    res.json({ ...result, instruction, mock: true, engine: 'hyper3d' })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('partswap failed:', err)
    res.status(500).json({ error: 'Failed to swap part' })
  }
})

// POST /api/edit/extract { modelUrl, partId?|point? } — P4 step 1: pull ONE part
// out into its own stored GLB, so the client can photograph it for the edit loop.
// → { partUrl, part: { id, name } }
router.post('/extract', async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const partId = typeof req.body?.partId === 'string' ? req.body.partId : ''
  const point = req.body?.point
  if (!modelUrl || (!partId && !point)) {
    return res.status(400).json({ error: 'modelUrl and one of partId / point are required' })
  }
  try {
    const { parts } = await segmentModel(modelUrl)
    const part = partId ? parts.find((p) => p.id === partId) : hitTestPart(parts, point)
    if (!part) return res.status(404).json({ error: 'no matching part for the given partId/point' })
    res.json(await extractPart(modelUrl, part))
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('extract failed:', err)
    res.status(500).json({ error: 'Failed to extract part' })
  }
})

// POST /api/edit/stitch { modelUrl, partId, partModelUrl } — P4 final step: fit a
// newly generated part model into the ORIGINAL part's bbox and swap it in; the
// rest of the model stays byte-identical. → { modelUrl, stitchedPart }
router.post('/stitch', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const partId = typeof req.body?.partId === 'string' ? req.body.partId : ''
  const partModelUrl = typeof req.body?.partModelUrl === 'string' ? req.body.partModelUrl : ''
  if (!modelUrl || !partId || !partModelUrl) {
    return res.status(400).json({ error: 'modelUrl, partId and partModelUrl are required' })
  }
  try {
    const { parts } = await segmentModel(modelUrl)
    const part = parts.find((p) => p.id === partId)
    if (!part) return res.status(404).json({ error: 'unknown partId for this model' })
    const result = await stitchPart(modelUrl, part, partModelUrl)

    // mirror a finished generation so the stitch lands in History + Library
    const label = `part-stitch: ${part.name}`.slice(0, 120)
    const taskId = `stitch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    recordTask({ kind: 'generate', taskId, prompt: label, mock: true, ownerId: req.user?.id ?? null })
    updateTask(taskId, 'SUCCEEDED', result.modelUrl)
    if (dbReady()) {
      try {
        await GeneratedModel.create({
          prompt: label,
          meshyTaskId: taskId,
          status: 'SUCCEEDED',
          modelUrl: result.modelUrl,
          mock: true,
          ownerId: req.user?.id ?? null,
        })
      } catch (err) {
        console.error('stitch library record failed:', err)
      }
    }

    res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('stitch failed:', err)
    res.status(500).json({ error: 'Failed to stitch part' })
  }
})

export default router
