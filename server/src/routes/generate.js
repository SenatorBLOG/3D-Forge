import { Router } from 'express'
import { createPreviewTask, getTask, isMockMode } from '../services/meshy.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'
import { recordTask, updateTask } from '../services/history.js'

const router = Router()

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'CANCELED']

// POST /api/generate — start a text-to-3D preview task (Meshy AI, or the
// built-in mock when no MESHY_API_KEY is configured)
router.post('/', async (req, res) => {
  const raw = req.body?.prompt
  const prompt = typeof raw === 'string' ? raw.trim() : ''
  if (!prompt) {
    return res.status(400).json({ error: 'prompt (non-empty string) is required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }

  let taskId
  try {
    taskId = await createPreviewTask(prompt)
  } catch (err) {
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

  res.status(202).json({ taskId, mock: isMockMode() })
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
