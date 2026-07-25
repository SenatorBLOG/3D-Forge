import { Router } from 'express'
import { segmentModel, segmentTripoByTaskId, hitTestPart, partSwap, extractPart, stitchPart } from '../services/segment.js'
import { optionalAuth } from '../middleware/auth.js'
import { recordTask, updateTask, listMemory } from '../services/history.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'

const router = Router()

// POST /api/edit/segment { modelUrl } — split a model into named parts (cached),
// using the free built-in GEOMETRIC segmentation (node graph / bands). Real
// Tripo semantic segmentation lives at /segment-tripo (spends credits).
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

// Find the Tripo generation task_id behind a stored model URL. Our records keep
// the (namespaced) task id next to the model URL; a real Tripo task is prefixed
// "tripo-". Returns the bare Tripo id, or null when the model isn't Tripo-made.
async function tripoTaskIdForModel(modelUrl) {
  let taskId = listMemory().find((e) => e.modelUrl === modelUrl)?.taskId || null
  if (!taskId && dbReady()) {
    try {
      taskId = (await GeneratedModel.findOne({ modelUrl }).lean())?.meshyTaskId || null
    } catch {
      /* non-fatal */
    }
  }
  return taskId && taskId.startsWith('tripo-') ? taskId.slice('tripo-'.length) : null
}

// POST /api/edit/segment-tripo { modelUrl } — REAL semantic segmentation via
// Tripo (~40 credits). Only works on models GENERATED with Tripo (we look up the
// native task_id behind the URL); anything else (Meshy, uploads) gets a clear
// 400 NOT_TRIPO so the button can explain instead of failing weirdly. On success
// returns a NEW segmented model URL (one mesh per part) + the parts.
router.post('/segment-tripo', async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' })
  try {
    const tripoId = await tripoTaskIdForModel(modelUrl)
    if (!tripoId) {
      return res.status(400).json({
        error: 'Tripo segmentation works only on models generated with Tripo.',
        code: 'NOT_TRIPO',
      })
    }
    const result = await segmentTripoByTaskId(tripoId, modelUrl)
    // mirror into History so the segmented model persists as a card
    const segTaskId = `tripo-seg-${Date.now()}`
    recordTask({ kind: 'generate', taskId: segTaskId, prompt: 'Segmented (Tripo)', mock: false })
    updateTask(segTaskId, 'SUCCEEDED', result.modelUrl)
    // ALSO persist to the Library (GeneratedModel), so the segmented model —
    // which cost real Tripo credits — survives a reload and can always be
    // reloaded as a segmented base. Without this it lived only in memory.
    if (dbReady()) {
      try {
        await GeneratedModel.create({
          prompt: 'Segmented (Tripo)',
          meshyTaskId: segTaskId,
          status: 'SUCCEEDED',
          modelUrl: result.modelUrl,
          mock: false,
          ownerId: null,
        })
      } catch (err) {
        console.error('segment library record failed:', err)
      }
    }
    res.json(result)
  } catch (err) {
    if (err.code === 'NO_KEY') return res.status(400).json({ error: err.message })
    console.error('tripo segment failed:', err)
    res.status(502).json({ error: err.message || 'Tripo segmentation failed' })
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
    res.status(500).json({ error: `Failed to extract part: ${err.message}` })
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
