import { Router } from 'express'
import { dbReady } from '../db.js'
import { listMemory, listDb } from '../services/history.js'

const router = Router()

const MAX_ENTRIES = 50

// GET /api/history — generations and edits as a unified version list,
// newest first; persisted records when Mongo is up, session memory otherwise
router.get('/', async (req, res) => {
  if (!dbReady()) {
    return res.json({ entries: listMemory().slice(0, MAX_ENTRIES), source: 'memory' })
  }
  try {
    res.json({ entries: await listDb(MAX_ENTRIES), source: 'db' })
  } catch (err) {
    console.error('history list failed:', err)
    res.status(500).json({ error: 'Failed to list history' })
  }
})

export default router
