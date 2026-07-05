import { Router } from 'express'
import {
  createPreviewTask,
  createRefineTask,
  createImageTask,
  getTask,
  isMockMode,
} from '../services/meshy.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask, updateTask, removeTask } from '../services/history.js'
import { optionalAuth } from '../middleware/auth.js'
import { getWallet, spend, grant } from '../services/wallet.js'
import { getImage, imageDataUri } from '../services/images.js'
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
async function chargeGeneration(req, { kind, aiModel, count = 1 }) {
  const cost = generationCost({ kind, aiModel, mock: isMockMode() }) * count
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
async function refundGeneration(req, { kind, aiModel, count = 1 }) {
  const cost = generationCost({ kind, aiModel, mock: isMockMode() }) * count
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
  if (mode === 'batch') return handleBatch(req, res, aiModel)

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
  const charge = await chargeGeneration(req, { kind: 'preview', aiModel })
  if (!charge.ok) return res.status(charge.status).json(charge.body)

  let taskId
  try {
    if (mode === 'image') {
      // Meshy can't reach our localhost /images URL, so inline the bytes as a
      // data URI in real mode; the mock ignores the input entirely.
      let imageInput = image.url
      if (!isMockMode()) {
        imageInput = await imageDataUri(image.id)
        if (!imageInput) {
          return res.status(500).json({ error: 'failed to read the reference image' })
        }
      }
      taskId = await createImageTask(imageInput, { aiModel })
    } else {
      taskId = await createPreviewTask(prompt, aiModel)
    }
  } catch (err) {
    await refundGeneration(req, { kind: 'preview', aiModel }) // task never started — give it back
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('generate failed:', err)
    return res.status(502).json({ error: 'Model generation service failed' })
  }

  recordTask({ kind: 'generate', taskId, prompt, mock: isMockMode() })

  // the upstream task exists at this point — a DB hiccup must not turn a
  // successful (credit-spending) creation into an error response
  if (dbReady()) {
    try {
      await GeneratedModel.create({ prompt, meshyTaskId: taskId, mock: isMockMode() })
    } catch (err) {
      console.error('failed to persist generation record:', err)
    }
  }

  res.status(202).json({
    taskId,
    mode,
    tier: aiModel,
    mock: isMockMode(),
    cost: generationCost({ kind: 'preview', aiModel, mock: isMockMode() }),
  })
})

// POST /api/generate/refine — add color/textures to a SUCCEEDED preview task
router.post('/refine', optionalAuth, async (req, res) => {
  const previewTaskId = typeof req.body?.previewTaskId === 'string' ? req.body.previewTaskId : ''
  if (!previewTaskId) {
    return res.status(400).json({ error: 'previewTaskId is required' })
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
  recordTask({ kind: 'generate', taskId, prompt, mock: isMockMode() })
  res.status(202).json({
    taskId,
    tier: aiModel,
    mock: isMockMode(),
    cost: generationCost({ kind: 'refine', aiModel, mock: isMockMode() }),
  })
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
    const task = await getTask(req.params.taskId)
    if (!task) return res.status(404).json({ error: 'Unknown task id' })

    const payload = {
      taskId: task.id,
      status: task.status,
      progress: task.progress ?? 0,
      modelUrl: task.model_urls?.glb ?? null,
    }

    if (TERMINAL_STATUSES.includes(task.status)) {
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
