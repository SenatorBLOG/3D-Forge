import { Router } from 'express'
import express from 'express'
import { segmentModel, segmentTripoByTaskId, segmentByMarks, segmentByColors, bakeGroups, hitTestPart, partSwap, extractPart, extractRegion, stitchPart, stitchRegion } from '../services/segment.js'
import { optionalAuth } from '../middleware/auth.js'
import { labelParts as aiLabelParts, isClaudeEnabled } from '../services/claude.js'
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
    // History only — the segmented model is a working version (persisted via the
    // version tree). It reaches the Library only when the user sends it there.
    const segTaskId = `tripo-seg-${Date.now()}`
    recordTask({ kind: 'generate', taskId: segTaskId, prompt: 'Segmented (Tripo)', mock: false })
    updateTask(segTaskId, 'SUCCEEDED', result.modelUrl)
    res.json(result)
  } catch (err) {
    if (err.code === 'NO_KEY') return res.status(400).json({ error: err.message })
    console.error('tripo segment failed:', err)
    res.status(502).json({ error: err.message || 'Tripo segmentation failed' })
  }
})

// POST /api/edit/segment-marks { modelUrl, seeds:[{ label, point:{x,y,z} }] } —
// USER-GUIDED segmentation: the user drops named seed points on the surface and
// every triangle goes to its nearest seed, so the parts come out exactly as
// marked (a sword, a shield, a helmet the auto-splitter would shatter). Free,
// geometric. Returns a NEW segmented model URL + parts (same shape as /segment).
router.post('/segment-marks', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const seeds = Array.isArray(req.body?.seeds) ? req.body.seeds : null
  const clean =
    seeds
      ?.filter((s) => s?.point && ['x', 'y', 'z'].every((k) => Number.isFinite(Number(s.point[k]))))
      .map((s) => ({ label: String(s.label ?? '').slice(0, 40), point: s.point })) || []
  if (!modelUrl || clean.length < 2) {
    return res.status(400).json({ error: 'modelUrl and at least 2 seed marks are required' })
  }
  try {
    const result = await segmentByMarks(modelUrl, clean)
    // log to History only — NOT the Library. A segmentation is a working version
    // on the right strip (persisted via the version tree); it lands in the Library
    // only when the user explicitly sends it there.
    const segTaskId = `marks-seg-${Date.now()}`
    recordTask({ kind: 'generate', taskId: segTaskId, prompt: 'Segmented (marks)', mock: true, ownerId: req.user?.id ?? null })
    updateTask(segTaskId, 'SUCCEEDED', result.modelUrl)
    res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'NO_GEOMETRY') return res.status(400).json({ error: err.message })
    console.error('segment-marks failed:', err)
    res.status(500).json({ error: 'Failed to segment by marks' })
  }
})

// POST /api/edit/bake-groups { modelUrl, groups:[{ name, partIds:[…] }] } — turn
// UI groups into real merged parts (#1): rebuilds the model so each group's
// segments become one named node. Fixes over-segmented Tripo output. → new model
// URL + parts (same shape as /segment). Free, geometric.
router.post('/bake-groups', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const groups = Array.isArray(req.body?.groups) ? req.body.groups : null
  if (!modelUrl || !groups?.length) {
    return res.status(400).json({ error: 'modelUrl and a non-empty groups array are required' })
  }
  try {
    const result = await bakeGroups(modelUrl, groups)
    // History only — not the Library (see segment-marks note above)
    const segTaskId = `bake-seg-${Date.now()}`
    recordTask({ kind: 'generate', taskId: segTaskId, prompt: 'Grouped part', mock: true, ownerId: req.user?.id ?? null })
    updateTask(segTaskId, 'SUCCEEDED', result.modelUrl)
    res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    if (err.code === 'NO_GROUPS') return res.status(400).json({ error: err.message })
    console.error('bake-groups failed:', err)
    res.status(500).json({ error: 'Failed to bake groups' })
  }
})

// POST /api/edit/segment-colors — #3 paint segmentation. Body is the raw painted
// GLB (vertices carry COLOR_0 labels; same colour = same part). Groups triangles
// by colour → new segmented model. → { modelUrl, parts }. Free, geometric.
router.post('/segment-colors', optionalAuth, express.raw({ type: '*/*', limit: '64mb' }), async (req, res) => {
  const body = req.body
  if (!Buffer.isBuffer(body) || body.length < 12 || body.toString('utf8', 0, 4) !== 'glTF') {
    return res.status(400).json({ error: 'send the painted .glb as the raw request body' })
  }
  try {
    const result = await segmentByColors(body)
    const segTaskId = `color-seg-${Date.now()}`
    recordTask({ kind: 'generate', taskId: segTaskId, prompt: 'Segmented (paint)', mock: true, ownerId: req.user?.id ?? null })
    updateTask(segTaskId, 'SUCCEEDED', result.modelUrl)
    res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND' || err.code === 'NO_GEOMETRY') return res.status(400).json({ error: err.message })
    console.error('segment-colors failed:', err)
    res.status(500).json({ error: 'Failed to segment by colour' })
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

    // History only — not the Library (a working version on the right strip)
    const label = `part-swap: ${part.name}${instruction ? ` — ${instruction}` : ''}`.slice(0, 120)
    const taskId = `partswap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    recordTask({ kind: 'generate', taskId, prompt: label, mock: true, ownerId: req.user?.id ?? null })
    updateTask(taskId, 'SUCCEEDED', result.modelUrl)

    res.json({ ...result, instruction, mock: true, engine: 'hyper3d' })
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('partswap failed:', err)
    res.status(500).json({ error: 'Failed to swap part' })
  }
})

// union of several parts' bboxes → one enclosing box
function unionBBox(list) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of list) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.bbox.min[i])
      max[i] = Math.max(max[i], p.bbox.max[i])
    }
  }
  return { min, max }
}

// POST /api/edit/extract { modelUrl, partId?|partIds?|point? } — P4/Task8 step 1:
// pull ONE part (or a GROUP of parts, via partIds) out into its own stored GLB so
// the client can photograph it for the edit loop. → { partUrl, part: { id, name } }
router.post('/extract', async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const partId = typeof req.body?.partId === 'string' ? req.body.partId : ''
  const partIds = Array.isArray(req.body?.partIds) ? req.body.partIds : null
  const point = req.body?.point
  if (!modelUrl || (!partId && !partIds && !point)) {
    return res.status(400).json({ error: 'modelUrl and one of partId / partIds / point are required' })
  }
  try {
    const { parts } = await segmentModel(modelUrl)
    if (partIds?.length) {
      const list = parts.filter((p) => partIds.includes(p.id))
      if (!list.length) return res.status(404).json({ error: 'no matching parts for the given partIds' })
      return res.json(await extractRegion(modelUrl, list, 'region', req.body?.name || 'region'))
    }
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
  const partIds = Array.isArray(req.body?.partIds) ? req.body.partIds : null
  const partModelUrl = typeof req.body?.partModelUrl === 'string' ? req.body.partModelUrl : ''
  if (!modelUrl || (!partId && !partIds) || !partModelUrl) {
    return res.status(400).json({ error: 'modelUrl, partId|partIds and partModelUrl are required' })
  }
  try {
    const { parts } = await segmentModel(modelUrl)
    let result, part
    if (partIds?.length) {
      const list = parts.filter((p) => partIds.includes(p.id))
      if (!list.length) return res.status(404).json({ error: 'unknown partIds for this model' })
      part = { name: req.body?.name || 'region' }
      result = await stitchRegion(modelUrl, list, partModelUrl, unionBBox(list), 'region', part.name)
    } else {
      part = parts.find((p) => p.id === partId)
      if (!part) return res.status(404).json({ error: 'unknown partId for this model' })
      result = await stitchPart(modelUrl, part, partModelUrl)
    }

    // History only — not the Library (a working version on the right strip)
    const label = `part-stitch: ${part.name}`.slice(0, 120)
    const taskId = `stitch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    recordTask({ kind: 'generate', taskId, prompt: label, mock: true, ownerId: req.user?.id ?? null })
    updateTask(taskId, 'SUCCEEDED', result.modelUrl)

    res.json(result)
  } catch (err) {
    if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message })
    console.error('stitch failed:', err)
    res.status(500).json({ error: 'Failed to stitch part' })
  }
})

export default router
