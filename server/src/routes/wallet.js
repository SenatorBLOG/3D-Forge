import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getWallet } from '../services/wallet.js'

const router = Router()

// GET /api/wallet — the signed-in user's 3D-token balance + ledger (newest-first)
router.get('/', requireAuth, async (req, res) => {
  try {
    res.json(await getWallet(req.user.id))
  } catch (err) {
    console.error('get wallet failed:', err)
    res.status(500).json({ error: 'Failed to load wallet' })
  }
})

export default router
