import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { prerigCheck, rigModel, applyAnimation } from '../services/animate.js'

const router = Router()

// map service errors → HTTP
function fail(res, err, verb) {
  if (err.code === 'NOT_TRIPO') return res.status(400).json({ error: err.message, code: 'NOT_TRIPO' })
  if (err.code === 'NO_KEY') return res.status(400).json({ error: err.message, code: 'NO_KEY' })
  if (err.code === 'DAILY_LIMIT') return res.status(429).json({ error: err.message, code: 'DAILY_LIMIT' })
  console.error(`${verb} failed:`, err)
  return res.status(500).json({ error: `Failed to ${verb} the model` })
}

// POST /api/animate/prerig { modelUrl } — FREE riggability check. Used to
// enable/disable the Animate button with a reason. → { riggable, rigType }
router.post('/prerig', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' })
  try {
    res.json(await prerigCheck(modelUrl))
  } catch (err) {
    fail(res, err, 'check')
  }
})

// POST /api/animate/rig { modelUrl } — put a skeleton on the model (25 cr).
// → { modelUrl (rigged GLB), rigTaskId }. rigTaskId is stored client-side so the
// 25 cr is paid only once; later animations chain off it.
router.post('/rig', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' })
  try {
    res.json(await rigModel(modelUrl))
  } catch (err) {
    fail(res, err, 'rig')
  }
})

// POST /api/animate/apply { rigTaskId, preset } — apply ONE preset animation to
// an already-rigged model (10 cr). → { modelUrl (GLB + clip), animTaskId, preset }
router.post('/apply', optionalAuth, async (req, res) => {
  const rigTaskId = typeof req.body?.rigTaskId === 'string' ? req.body.rigTaskId : ''
  const preset = typeof req.body?.preset === 'string' ? req.body.preset : ''
  if (!rigTaskId) return res.status(400).json({ error: 'rigTaskId is required' })
  if (!preset) return res.status(400).json({ error: 'preset is required' })
  try {
    res.json(await applyAnimation(rigTaskId, preset))
  } catch (err) {
    fail(res, err, 'animate')
  }
})

export default router
