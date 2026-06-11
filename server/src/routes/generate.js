import { Router } from 'express'

const router = Router()

// POST /api/generate — text-to-3D via Meshy AI.
// Stub: milestone M2 implements the real call (see docs/plans/ and docs/ARCHITECTURE.md).
router.post('/', (req, res) => {
  const { prompt } = req.body ?? {}
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt (string) is required' })
  }
  res.status(501).json({
    error: 'Not implemented yet',
    todo: 'M2: send prompt to Meshy AI text-to-3D, poll the job, return the GLB url',
  })
})

export default router
