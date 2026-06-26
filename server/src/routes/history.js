import { Router } from 'express'
import { unlink } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { dbReady } from '../db.js'
import { listMemory, listDb, removeTask } from '../services/history.js'
import { UPLOAD_DIR } from './models.js'

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

// DELETE /api/history/:taskId — remove an entry from the session history
// (memory/dev-file mode). Also deletes the stored file for uploaded models.
router.delete('/:taskId', async (req, res) => {
  const removed = removeTask(req.params.taskId)
  if (!removed) return res.status(404).json({ error: 'Unknown history entry' })
  if (typeof removed.modelUrl === 'string' && removed.modelUrl.startsWith('/uploads/')) {
    unlink(join(UPLOAD_DIR, basename(removed.modelUrl))).catch(() => {}) // best-effort
  }
  res.json({ ok: true })
})

export default router
