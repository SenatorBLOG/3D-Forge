import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { getUserByUsername } from '../services/auth.js'
import { toggleFollow, isFollowing, followCounts } from '../services/follows.js'
import { notify } from '../services/notifications.js'

const router = Router()

// GET /api/users/:username — public profile: follower/following counts + whether
// the current user follows them
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const target = await getUserByUsername(req.params.username)
    if (!target) return res.status(404).json({ error: 'User not found' })
    const [counts, following] = await Promise.all([
      followCounts(target.id),
      isFollowing(req.user?.id, target.id),
    ])
    res.json({
      username: target.username,
      followers: counts.followers,
      following: counts.following,
      isFollowing: following,
      isSelf: req.user?.id === target.id,
    })
  } catch (err) {
    console.error('get user failed:', err)
    res.status(500).json({ error: 'Failed to load user' })
  }
})

// POST /api/users/:username/follow — toggle following that user (auth required)
router.post('/:username/follow', requireAuth, async (req, res) => {
  try {
    const target = await getUserByUsername(req.params.username)
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.id === req.user.id) {
      return res.status(400).json({ error: "You can't follow yourself" })
    }
    const result = await toggleFollow(req.user.id, target.id)
    if (result.following) {
      try {
        await notify({ recipientId: target.id, type: 'follow', actor: req.user })
      } catch (e) {
        console.error('notify (follow) failed:', e)
      }
    }
    res.json(result) // { following, followers }
  } catch (err) {
    console.error('toggle follow failed:', err)
    res.status(500).json({ error: 'Failed to update follow' })
  }
})

export default router
