import { Router } from 'express'
import { createRefineTask, isMockMode } from '../services/meshy.js'
import { resolveEngine, engineIsMock, startGeneration, getAnyTask } from '../services/engines.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask, updateTask, removeTask } from '../services/history.js'
import { optionalAuth } from '../middleware/auth.js'
import { getWallet, spend, grant } from '../services/wallet.js'
import { getImage, imageDataUri, readImageBytes } from '../services/images.js'
import { archiveModelUrl } from '../services/modelArchive.js'
import { generationCost, priceList } from '../services/costs.js'

const router = Router()

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELED']

// Cost-gate a generation by charging UP FRONT: free + ungated in mock mode; in
// real (keyed) mode it requires a signed-in user and atomically spends the cost
// before the upstream task starts. Spending atomically (wallet.spend uses a
// conditional $inc) is what closes the race — two concurrent requests can't both
// pass on the same balance. Returns { ok:true, cost } to proceed, or
// { ok:false, status, body } (401 / 402) to reject. If the task then fails to
// start, the caller must refundGeneration() so a failed generation costs nothing.
async function chargeGeneration(req, { kind, aiModel, mock = isMockMode() }) {
  const cost = generationCost({ kind, aiModel, mock })
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
async function refundGeneration(req, { kind, aiModel, mock = isMockMode() }) {
  const cost = generationCost({ kind, aiModel, mock })
  if (cost === 0 || !req.user) return
  try {
    await grant(req.user.id, cost, `refund:${kind}:${aiModel}`)
  } catch (err) {
    console.error('generation refund failed:', err)
  }
}

// POST /api/generate — start a generation task on the chosen engine.
// Engines: 'meshy' (default; tiers meshy-5/meshy-6) or 'tripo'. Each engine
// falls back to the built-in mock when its API key is absent.
router.post('/', optionalAuth, async (req, res) => {
  // meshy-5 (cheap) by default; meshy-6 is prettier but costs more credits
  const aiModel = req.body?.model === 'meshy-6' ? 'meshy-6' : 'meshy-5'
  const mode = req.body?.mode === 'image' ? 'image' : 'text'
  const engine = resolveEngine(req.body?.engine)
  const mock = engineIsMock(engine)

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

  recordTask({ kind: 'generate', taskId, prompt, mock, engine })

  // the upstream task exists at this point — a DB hiccup must not turn a
  // successful (credit-spending) creation into an error response
  if (dbReady()) {
    try {
      await GeneratedModel.create({ prompt, meshyTaskId: taskId, mock })
    } catch (err) {
      console.error('failed to persist generation record:', err)
    }
  }

  res.status(202).json({
    taskId,
    mode,
    engine,
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
  const aiModel = req.body?.model === 'meshy-6' ? 'meshy-6' : 'meshy-5'
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
    mock: isMockMode(),
    cost: generationCost({ kind: 'refine', aiModel, mock: isMockMode() }),
  })
})

// GET /api/generate/costs — the token price list for the UI (declared before
// /:taskId so "costs" isn't captured as a task id). Always shows real prices.
router.get('/costs', (_req, res) => {
  res.json(priceList())
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
      // Meshy's signed URLs expire; ours don't. No-op for mock/local results.
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
