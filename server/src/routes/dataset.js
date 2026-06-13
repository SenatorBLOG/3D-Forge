import { Router } from 'express'
import { dbReady } from '../db.js'
import { updateEvaluation } from '../services/history.js'
import { listDataset, toCsv } from '../services/dataset.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'

const router = Router()

// GET /api/dataset — every edit as a dataset row (the research output)
router.get('/', async (req, res) => {
  try {
    res.json(await listDataset())
  } catch (err) {
    console.error('dataset list failed:', err)
    res.status(500).json({ error: 'Failed to build dataset' })
  }
})

// GET /api/dataset.csv — same rows as a downloadable CSV
router.get('/csv', async (req, res) => {
  try {
    const { records } = await listDataset()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="3dforge-dataset.csv"')
    res.send(toCsv(records))
  } catch (err) {
    console.error('dataset csv failed:', err)
    res.status(500).json({ error: 'Failed to build dataset' })
  }
})

// PATCH /api/dataset/:taskId — set/clear the 1-5 evaluation rating
router.patch('/:taskId', async (req, res) => {
  const { evaluation } = req.body ?? {}
  const valid =
    evaluation === null ||
    (Number.isInteger(evaluation) && evaluation >= 1 && evaluation <= 5)
  if (!valid) {
    return res.status(400).json({ error: 'evaluation must be an integer 1-5 or null' })
  }

  const inMemory = updateEvaluation(req.params.taskId, evaluation)
  let inDb = false
  if (dbReady()) {
    try {
      const r = await SpatialPromptRecord.findOneAndUpdate(
        { meshyTaskId: req.params.taskId },
        { evaluation },
      )
      inDb = !!r
    } catch (err) {
      console.error('evaluation update failed:', err)
      return res.status(500).json({ error: 'Failed to save evaluation' })
    }
  }

  if (!inMemory && !inDb) return res.status(404).json({ error: 'Unknown task id' })
  res.json({ ok: true })
})

export default router
