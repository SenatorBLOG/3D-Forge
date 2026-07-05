import { Router } from 'express'
import { listThemes } from '../services/themes.js'

const router = Router()

// GET /api/themes — the curated theme taxonomy with live post counts
router.get('/', async (_req, res) => {
  try {
    res.json({ themes: await listThemes() })
  } catch (err) {
    console.error('list themes failed:', err)
    res.status(500).json({ error: 'Failed to load themes' })
  }
})

export default router
