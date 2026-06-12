import { Router } from 'express'
import { createPreviewTask, getTask, isMockMode } from '../services/meshy.js'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'

const router = Router()

// POST /api/generate — start a text-to-3D preview task (Meshy AI, or the
// built-in mock when no MESHY_API_KEY is configured)
router.post('/', async (req, res) => {
  const { prompt } = req.body ?? {}
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt (non-empty string) is required' })
  }
  if (prompt.length > 600) {
    return res.status(400).json({ error: 'prompt must be 600 characters or fewer' })
  }

  try {
    const taskId = await createPreviewTask(prompt.trim())
    if (dbReady()) {
      await GeneratedModel.create({
        prompt: prompt.trim(),
        meshyTaskId: taskId,
        mock: isMockMode(),
      })
    }
    res.status(202).json({ taskId, mock: isMockMode() })
  } catch (err) {
    console.error('generate failed:', err)
    res.status(502).json({ error: 'Model generation service failed' })
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

    if (dbReady() && (task.status === 'SUCCEEDED' || task.status === 'FAILED')) {
      await GeneratedModel.findOneAndUpdate(
        { meshyTaskId: payload.taskId },
        { status: task.status, modelUrl: payload.modelUrl },
      )
    }

    res.json(payload)
  } catch (err) {
    console.error('task poll failed:', err)
    res.status(502).json({ error: 'Model generation service failed' })
  }
})

export default router
