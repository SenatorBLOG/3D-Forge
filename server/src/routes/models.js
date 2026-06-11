import { Router } from 'express'
import { dbReady } from '../db.js'

const router = Router()

// GET /api/models — list saved model versions.
// Stub until the Mongo schema lands in milestone M2 (see docs/plans/).
router.get('/', (req, res) => {
  res.json({ models: [], db: dbReady() })
})

export default router
