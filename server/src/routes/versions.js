import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { getTreeByModelUrl, saveTree } from '../services/versionTree.js'

const router = Router()

// GET /api/versions?modelUrl=<url> — the durable version tree that contains this
// model (as root or any node), scoped to the signed-in user. → { tree } or
// { tree: null }. Lets the client restore the whole strip on load, even after a
// Library detour, restart, or re-login.
router.get('/', optionalAuth, async (req, res) => {
  const modelUrl = typeof req.query.modelUrl === 'string' ? req.query.modelUrl : ''
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' })
  try {
    const tree = await getTreeByModelUrl(req.user?.id ?? null, modelUrl)
    res.json({ tree })
  } catch (err) {
    console.error('version tree load failed:', err)
    res.status(500).json({ error: 'failed to load version history' })
  }
})

// PUT /api/versions — upsert the tree for (user, rootModelUrl). Body:
// { rootModelUrl?, versions:[{id,parentId,modelUrl,label,kind}], currentVersionId }.
// Called whenever the strip changes; keeps edits as versions, never touches Library.
router.put('/', optionalAuth, async (req, res) => {
  const versions = Array.isArray(req.body?.versions) ? req.body.versions : null
  if (!versions || !versions.length) {
    return res.status(400).json({ error: 'versions (non-empty array) is required' })
  }
  try {
    const tree = await saveTree(req.user?.id ?? null, {
      rootModelUrl: typeof req.body?.rootModelUrl === 'string' ? req.body.rootModelUrl : '',
      versions,
      currentVersionId:
        typeof req.body?.currentVersionId === 'string' ? req.body.currentVersionId : null,
    })
    res.json({ tree })
  } catch (err) {
    console.error('version tree save failed:', err)
    res.status(500).json({ error: 'failed to save version history' })
  }
})

export default router
