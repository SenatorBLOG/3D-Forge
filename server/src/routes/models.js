import { Router } from 'express'
import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'

const router = Router()

// GET /api/models — most recent saved generations (empty without a DB)
router.get('/', async (req, res) => {
  if (!dbReady()) return res.json({ models: [], db: false })
  try {
    const models = await GeneratedModel.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json({ models, db: true })
  } catch (err) {
    console.error('models list failed:', err)
    res.status(500).json({ error: 'Failed to list models' })
  }
})

export default router
