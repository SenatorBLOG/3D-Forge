import { Router } from 'express'
import { createRefineTask, createImageTask, isMockMode } from '../services/meshy.js'
import { resolveEngine, engineIsMock, startGeneration, getAnyTask } from '../services/engines.js'
import { createTripoMultiviewTask, createTripoRetextureTask, isTripoMock } from '../services/tripo.js'
import { readModelBytes } from '../services/segment.js'
import { archiveModelUrl } from '../services/modelArchive.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask, updateTask, removeTask } from '../services/history.js'
import { optionalAuth } from '../middleware/auth.js'
import { getWallet, spend, grant } from '../services/wallet.js'
import { getImage, imageDataUri, readImageBytes } from '../services/images.js'
import { createBatch, batchStatus } from '../services/batch.js'
import { generationCost, priceList } from '../services/costs.js'

const router = Router()

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELED']

// Unified tier resolution: the API takes `tier` ('meshy-5' | 'meshy-6', with
// 'm5'/'m6' shorthands); the legacy `model` body field stays as an alias so
// older clients keep working. Anything unrecognized falls back to the cheap tier.
export function resolveTier(body) {
  const raw = typeof body?.tier === 'string' ? body.tier : body?.model
  return raw === 'meshy-6' || raw === 'm6' ? 'meshy-6' : 'meshy-5'
}

const MODES = ['text', 'image', 'batch']
const MAX_BATCH = 6 // images per batch — keeps real-mode cost/credit burn sane

// Cost-gate a generation by charging UP FRONT: free + ungated in mock mode; in
// real (keyed) mode it requires a signed-in user and atomically spends the cost
// before the upstream task starts. Spending atomically (wallet.spend uses a
// conditional $inc) is what closes the race — two concurrent requests can't both
// pass on the same balance. Returns { ok:true, cost } to proceed, or
// { ok:false, status, body } (401 / 402) to reject. If the task then fails to
// start, the caller must refundGeneration() so a failed generation costs nothing.
async function chargeGeneration(req, { kind, aiModel, count = 1, mock = isMockMode() }) {
  const cost = generationCost({ kind, aiModel, mock }) * count
  if (cost === 0) return { ok: true, cost } // mock mode — never gated/charged
  if (!req.user) {
    return {
      ok: false,
      status: 401,
      body: { error: 'Sign in to generate — real generation costs 3D-tokens' },
    }
  }
  try {
    await spend(req.user.id, cost, `${kind}:${aiModel}`)
  } catch (err) {
    if (err.code === 'INSUFFICIENT') {
      const { balance } = await getWallet(req.user.id)
      return { ok: false, status: 402, body: { error: 'Not enough 3D-tokens', cost, balance } }
    }
    throw err
  }
  return { ok: true, cost }
}

// Give the tokens back when an already-charged generation fails to start.
// Best-effort: a failed refund only logs (the user can be made whole manually).
async function refundGeneration(req, { kind, aiModel, count = 1, mock = isMockMode() }) {
  const cost = generationCost({ kind, aiModel, mock }) * count
  if (cost === 0 || !req.user) return
  try {
    await grant(req.user.id, cost, `refund:${kind}:${aiModel}`)
  } catch (err) {
    console.error('generation refund failed:', err)
  }
}

// Resolve an image to the input Meshy needs: our local URL in mock mode, the
// inlined bytes (data URI) in real mode — Meshy can't reach localhost URLs.
async function meshyImageInput(image) {
  if (isMockMode()) return image.url
  return imageDataUri(image.id)
}

// mode:'batch' — several reference images become one polled unit (B6).
// Charges all tasks up front (atomic, same as single); per-task creation
// failures refund that task's cost and are reported, they don't sink the batch.
async function handleBatch(req, res, aiModel) {
  const raw = req.body?.imageIds
  const imageIds = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  if (imageIds.length < 1 || imageIds.length > MAX_BATCH || imageIds.length !== raw?.length) {
    return res.status(400).json({ error: `imageIds must be 1-${MAX_BATCH} image ids` })
  }
  const images = await Promise.all(imageIds.map((id) => getImage(id)))
  const missing = imageIds.filter((_, i) => !images[i])
  if (missing.length) {
    return res.status(404).json({ error: 'Unknown imageId(s)', imageIds: missing })
  }

  const charge = await chargeGeneration(req, { kind: 'preview', aiModel, count: images.length })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  const ownerId = req.user?.id ?? null
  const tasks = []
  const failed = []
  for (const image of images) {
    try {
      const input = await meshyImageInput(image)
      if (!input) throw new Error(`image ${image.id} unreadable`)
      const taskId = await createImageTask(input, { aiModel })
      recordTask({
        kind: 'generate',
        taskId,
        prompt: image.prompt || 'image-to-3d (batch)',
        mock: isMockMode(),
        ownerId,
      })
      tasks.push({ taskId, imageId: image.id })
    } catch (err) {
      console.error('batch task failed to start:', err)
      await refundGeneration(req, { kind: 'preview', aiModel }) // this task never started
      failed.push(image.id)
    }
  }
  if (tasks.length === 0) {
    return res.status(502).json({ error: 'No batch task could be started', failed })
  }

  const batch = await createBatch({ ownerId, tasks })
  res.status(202).json({
    batchId: batch.batchId,
    mode: 'batch',
    tier: aiModel,
    mock: isMockMode(),
    cost: generationCost({ kind: 'preview', aiModel, mock: isMockMode() }) * tasks.length,
    tasks,
    ...(failed.length ? { failed } : {}),
  })
}

// POST /api/generate — the unified generation entry point (B5).
// Body: { mode: 'text'|'image'|'batch', tier: 'meshy-5'|'meshy-6',
//         prompt? (text), imageId? (image), imageIds? (batch) }.
// Meshy AI when keyed, the built-in mock otherwise; poll GET /:taskId as before
// (batches poll GET /batch/:id).
router.post('/', optionalAuth, async (req, res) => {
  // meshy-5 (cheap) by default; meshy-6 is prettier but costs more credits
  const aiModel = resolveTier(req.body)
  const mode = req.body?.mode == null ? 'text' : req.body.mode
  if (!MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${MODES.join(', ')}` })
  }
  // engine: 'meshy' (default) | 'tripo' — each mocks independently when keyless
  const engine = resolveEngine(req.body?.engine)
  const mock = engineIsMock(engine)
  if (mode === 'batch') {
    if (engine === 'tripo') {
      return res.status(400).json({ error: 'batch mode is Meshy-only for now' })
    }
    return handleBatch(req, res, aiModel)
  }

  // resolve the input per mode: a text prompt, or a stored reference image
  let prompt = ''
  let image = null
  if (mode === 'image') {
    const imageId = typeof req.body?.imageId === 'string' ? req.body.imageId : ''
    if (!imageId) {
      return res.status(400).json({ error: 'imageId is required for mode "image"' })
    }
    image = await getImage(imageId)
    if (!image) return res.status(404).json({ error: 'Unknown imageId' })
    // a label for History; image-to-3D is driven by the image, not a prompt
    prompt = image.prompt || 'image-to-3d'
  } else {
    prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
    if (!prompt) {
      return res.status(400).json({ error: 'prompt (non-empty string) is required' })
    }
    if (prompt.length > 600) {
      return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
    }
  }

  // cost gating (real mode only — mock stays free): charge up front so
  // concurrent requests can't race the balance check
  const charge = await chargeGeneration(req, { kind: 'preview', aiModel, mock })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  let taskId
  try {
    let imageInput
    if (mode === 'image' && !mock) {
      // providers can't reach our localhost URLs — hand them the bytes:
      // Meshy takes a data URI, Tripo a multipart upload (raw bytes).
      if (engine === 'tripo') {
        const file = await readImageBytes(image)
        if (!file) return res.status(500).json({ error: 'failed to read the reference image' })
        imageInput = { bytes: file.bytes, mime: file.mime }
      } else {
        const dataUri = await imageDataUri(image.id)
        if (!dataUri) return res.status(500).json({ error: 'failed to read the reference image' })
        imageInput = { dataUri }
      }
    } else if (mode === 'image') {
      imageInput = { url: image.url } // mock ignores the input entirely
    }
    taskId = await startGeneration({ engine, mode, prompt, imageInput, aiModel })
  } catch (err) {
    await refundGeneration(req, { kind: 'preview', aiModel, mock }) // task never started — give it back
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('generate failed:', err)
    return res.status(502).json({ error: 'Model generation service failed' })
  }

  const ownerId = req.user?.id ?? null
  recordTask({ kind: 'generate', taskId, prompt, mock, engine, ownerId })

  // the upstream task exists at this point — a DB hiccup must not turn a
  // successful (credit-spending) creation into an error response
  if (dbReady()) {
    try {
      await GeneratedModel.create({ prompt, meshyTaskId: taskId, mock, ownerId })
    } catch (err) {
      console.error('failed to persist generation record:', err)
    }
  }

  res.status(202).json({
    taskId,
    mode,
    engine,
    tier: aiModel,
    mock,
    cost: generationCost({ kind: 'preview', aiModel, mock }),
  })
})

// POST /api/generate/refine — add color/textures to a SUCCEEDED preview task
router.post('/refine', optionalAuth, async (req, res) => {
  const previewTaskId = typeof req.body?.previewTaskId === 'string' ? req.body.previewTaskId : ''
  if (!previewTaskId) {
    return res.status(400).json({ error: 'previewTaskId is required' })
  }
  if (req.body?.engine === 'tripo' || previewTaskId.startsWith('tripo-')) {
    return res.status(400).json({ error: 'refine (texturing) is Meshy-only for now' })
  }
  const aiModel = resolveTier(req.body)
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : 'textured model'

  // charge up front (real mode only — mock stays free)
  const charge = await chargeGeneration(req, { kind: 'refine', aiModel })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  let taskId
  try {
    taskId = await createRefineTask(previewTaskId, { aiModel })
  } catch (err) {
    await refundGeneration(req, { kind: 'refine', aiModel }) // task never started — give it back
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('refine failed:', err)
    return res.status(502).json({ error: 'Texturing service failed' })
  }
  // the textured result supersedes the gray preview entry — drop it, keep one card
  removeTask(previewTaskId)
  const refineOwnerId = req.user?.id ?? null
  recordTask({ kind: 'generate', taskId, prompt, mock: isMockMode(), ownerId: refineOwnerId })
  // mirror the history swap in Mongo so the library (B8) shows the refined model
  // under its new taskId instead of the stale gray preview. Best-effort, like POST /.
  if (dbReady()) {
    try {
      await GeneratedModel.create({
        prompt,
        meshyTaskId: taskId,
        mock: isMockMode(),
        ownerId: refineOwnerId,
      })
      await GeneratedModel.findOneAndDelete({ meshyTaskId: previewTaskId })
    } catch (err) {
      console.error('failed to persist refine record:', err)
    }
  }
  res.status(202).json({
    taskId,
    tier: aiModel,
    mock: isMockMode(),
    cost: generationCost({ kind: 'refine', aiModel, mock: isMockMode() }),
  })
})

// POST /api/generate/multiview — P1.5 fidelity path: 2-4 views of the SAME object
// (edited front + original side/back) reconstruct one model that keeps the body.
// Tripo-only (its multiview_to_model); mock-safe (no key → mock model, free).
router.post('/multiview', optionalAuth, async (req, res) => {
  const raw = req.body?.imageIds
  const imageIds = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  if (imageIds.length < 2 || imageIds.length > 4 || imageIds.length !== raw?.length) {
    return res.status(400).json({ error: 'imageIds must be 2-4 view image ids' })
  }
  const images = await Promise.all(imageIds.map((id) => getImage(id)))
  const missing = imageIds.filter((_, i) => !images[i])
  if (missing.length) return res.status(404).json({ error: 'Unknown imageId(s)', imageIds: missing })

  const mock = isTripoMock()
  // cost gating (real Tripo only — mock stays free/ungated), same pattern as POST /
  const charge = await chargeGeneration(req, { kind: 'preview', aiModel: 'meshy-5', mock })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  let taskId
  try {
    let views
    if (mock) {
      views = images.map((im) => ({ url: im.url })) // mock ignores the bytes
    } else {
      views = await Promise.all(
        images.map(async (im) => {
          const f = await readImageBytes(im)
          if (!f) throw new Error(`view ${im.id} unreadable`)
          return { bytes: f.bytes, mime: f.mime }
        }),
      )
    }
    const id = await createTripoMultiviewTask(views)
    taskId = isTripoMock() ? id : `tripo-${id}` // namespace real Tripo ids for polling
  } catch (err) {
    await refundGeneration(req, { kind: 'preview', aiModel: 'meshy-5', mock })
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('multiview failed:', err)
    return res.status(502).json({ error: 'Multi-view generation failed' })
  }

  const ownerId = req.user?.id ?? null
  recordTask({ kind: 'generate', taskId, prompt: 'multi-view → 3D', mock, engine: 'tripo', ownerId })
  res.status(202).json({ taskId, mode: 'multiview', engine: 'tripo', mock, cost: charge.cost })
})

// POST /api/generate/retexture — P2 surface edit: recolor / re-material an
// EXISTING model by prompt, geometry untouched (no drift). Tripo texture_model;
// mock-safe (no key → mock model, free). → { taskId, mock }, poll GET /:taskId.
router.post('/retexture', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''
  if (!modelUrl || !prompt) {
    return res.status(400).json({ error: 'modelUrl and prompt are required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }

  const mock = isTripoMock()
  const charge = await chargeGeneration(req, { kind: 'preview', aiModel: 'meshy-5', mock })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  let taskId
  try {
    let bytes = null
    if (!mock) {
      bytes = await readModelBytes(modelUrl)
      if (!bytes) return res.status(400).json({ error: 'could not read the model to retexture' })
    }
    const id = await createTripoRetextureTask({ bytes, prompt })
    taskId = isTripoMock() ? id : `tripo-${id}`
  } catch (err) {
    await refundGeneration(req, { kind: 'preview', aiModel: 'meshy-5', mock })
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('retexture failed:', err)
    return res.status(502).json({ error: 'Retexture failed' })
  }

  const ownerId = req.user?.id ?? null
  recordTask({ kind: 'generate', taskId, prompt: `retexture: ${prompt}`, mock, engine: 'tripo', ownerId })
  res.status(202).json({ taskId, mode: 'retexture', engine: 'tripo', mock, cost: charge.cost })
})

// GET /api/generate/costs — the token price list for the UI (declared before
// /:taskId so "costs" isn't captured as a task id). Always shows real prices.
router.get('/costs', (_req, res) => {
  res.json(priceList())
})

// GET /api/generate/batch/:id — poll a whole batch (declared before /:taskId
// so "batch" isn't captured as a task id)
router.get('/batch/:id', async (req, res) => {
  try {
    const status = await batchStatus(req.params.id)
    if (!status) return res.status(404).json({ error: 'Unknown batch id' })
    res.json(status)
  } catch (err) {
    console.error('batch poll failed:', err)
    res.status(502).json({ error: 'Batch status failed' })
  }
})

// GET /api/generate/:taskId — poll task status/progress/result
router.get('/:taskId', async (req, res) => {
  try {
    const task = await getAnyTask(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Unknown task id' })

    const payload = {
      taskId: task.id,
      status: task.status,
      progress: task.progress ?? 0,
      modelUrl: task.model_urls?.glb ?? null,
    }

    if (TERMINAL_STATUSES.includes(task.status)) {
      // E4: park the finished GLB in our own storage before recording it —
      // provider URLs expire; ours don't. No-op for mock/local results.
      if (task.status === 'SUCCEEDED') {
        payload.modelUrl = await archiveModelUrl(payload.taskId, payload.modelUrl)
      }
      updateTask(payload.taskId, task.status, payload.modelUrl)
      // best-effort, like the POST handler: a DB hiccup must not hide an
      // already-fetched result from the client
      if (dbReady()) {
        try {
          const change = { status: task.status, modelUrl: payload.modelUrl }
          await Promise.all([
            GeneratedModel.findOneAndUpdate({ meshyTaskId: payload.taskId }, change),
            SpatialPromptRecord.findOneAndUpdate({ meshyTaskId: payload.taskId }, change),
          ])
        } catch (err) {
          console.error('failed to update generation record:', err)
        }
      }
    }

    res.json(payload)
  } catch (err) {
    console.error('task poll failed:', err)
    res.status(502).json({ error: 'Model generation service failed' })
  }
})

export default router
