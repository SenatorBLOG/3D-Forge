import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getWallet, purchasePackage, PACKAGES } from '../services/wallet.js'

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

// GET /api/wallet/packages — the "buy tokens" price list (public; display-only prices)
router.get('/packages', (_req, res) => {
  res.json({ packages: PACKAGES })
})

// POST /api/wallet/grant — simulated token purchase (A13). Body: { package: <id> }.
// No real payment: the allow-listed package's tokens are granted to the caller.
router.post('/grant', requireAuth, async (req, res) => {
  const packageId = typeof req.body?.package === 'string' ? req.body.package : ''
  try {
    res.status(201).json(await purchasePackage(req.user.id, packageId))
  } catch (err) {
    if (err.code === 'BAD_PACKAGE') return res.status(400).json({ error: err.message })
    console.error('wallet grant failed:', err)
    res.status(500).json({ error: 'Failed to grant tokens' })
  }
})

export default router
