import { Router } from 'express'
import { createPreviewTask, createRefineTask, getTask, isMockMode } from '../services/meshy.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask, updateTask, removeTask } from '../services/history.js'
import { optionalAuth } from '../middleware/auth.js'
import { getWallet, spend } from '../services/wallet.js'
import { generationCost, priceList } from '../services/costs.js'

const router = Router()

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELED']

// Cost-gate a generation: free + ungated in mock mode; in real (keyed) mode it
// requires a signed-in user with enough 3D-tokens. Returns null when the request
// may proceed, or a { status, body } to send back (401 / 402). Caller charges
// AFTER the upstream task actually starts (see chargeGeneration) so a failed
// generation never costs tokens.
async function gateGeneration(req, { kind, aiModel }) {
  const cost = generationCost({ kind, aiModel, mock: isMockMode() })
  if (cost === 0) return null // mock mode — never gated
  if (!req.user) {
    return { status: 401, body: { error: 'Sign in to generate — real generation costs 3D-tokens' } }
  }
  const { balance } = await getWallet(req.user.id)
  if (balance < cost) {
    return { status: 402, body: { error: 'Not enough 3D-tokens', cost, balance } }
  }
  return null
}

// Charge the user after a real task has started. Best-effort: a rare race (balance
// dropped since the pre-check) only logs — we don't fail an already-started job.
async function chargeGeneration(req, { kind, aiModel }) {
  const cost = generationCost({ kind, aiModel, mock: isMockMode() })
  if (cost === 0 || !req.user) return
  try {
    await spend(req.user.id, cost, `${kind}:${aiModel}`)
  } catch (err) {
    console.error('post-generation charge failed:', err)
  }
}

// POST /api/generate — start a text-to-3D preview task (Meshy AI, or the
// built-in mock when no MESHY_API_KEY is configured)
router.post('/', optionalAuth, async (req, res) => {
  const raw = req.body?.prompt
  const prompt = typeof raw === 'string' ? raw.trim() : ''
  if (!prompt) {
    return res.status(400).json({ error: 'prompt (non-empty string) is required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }
  // meshy-5 (cheap) by default; meshy-6 is prettier but costs more credits
  const aiModel = req.body?.model === 'meshy-6' ? 'meshy-6' : 'meshy-5'

  // cost gating (real mode only — mock stays free): block before spending a
  // Meshy credit if the user can't pay
  const gate = await gateGeneration(req, { kind: 'preview', aiModel })
  if (gate) return res.status(gate.status).json(gate.body)

  let taskId
  try {
    taskId = await createPreviewTask(prompt, aiModel)
  } catch (err) {
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('generate failed:', err)
    return res.status(502).json({ error: 'Model generation service failed' })
  }

  await chargeGeneration(req, { kind: 'preview', aiModel })

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
  const aiModel = req.body?.model === 'meshy-6' ? 'meshy-6' : 'meshy-5'
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : 'textured model'

  const gate = await gateGeneration(req, { kind: 'refine', aiModel })
  if (gate) return res.status(gate.status).json(gate.body)

  try {
    const taskId = await createRefineTask(previewTaskId, { aiModel })
    await chargeGeneration(req, { kind: 'refine', aiModel })
    // the textured result supersedes the gray preview entry — drop it, keep one card
    removeTask(previewTaskId)
    recordTask({ kind: 'generate', taskId, prompt, mock: isMockMode() })
    res.status(202).json({
      taskId,
      mock: isMockMode(),
      cost: generationCost({ kind: 'refine', aiModel, mock: isMockMode() }),
    })
  } catch (err) {
    if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message })
    console.error('refine failed:', err)
    res.status(502).json({ error: 'Texturing service failed' })
  }
})

// GET /api/generate/costs — the token price list for the UI (declared before
// /:taskId so "costs" isn't captured as a task id). Always shows real prices.
router.get('/costs', (_req, res) => {
  res.json(priceList())
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
