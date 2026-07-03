import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { getUserByUsername, updateProfile } from '../services/auth.js'
import { toggleFollow, isFollowing, followCounts } from '../services/follows.js'
import { notify } from '../services/notifications.js'

const router = Router()

// avatar colours a user may pick (must match the client palette — Avatar.jsx)
const AVATAR_COLORS = ['#22d3ee', '#ff2d9b', '#a855f7', '#35e6a4', '#ffd23d', '#5b8cff']

// PATCH /api/users/me — edit your own profile (bio / avatar colour / banner)
router.patch('/me', requireAuth, async (req, res) => {
  const fields = {}
  const body = req.body || {}
  if (typeof body.bio === 'string') fields.bio = body.bio.trim().slice(0, 160)
  if ('avatarColor' in body) {
    if (body.avatarColor === null || AVATAR_COLORS.includes(body.avatarColor)) {
      fields.avatarColor = body.avatarColor
    } else {
      return res.status(400).json({ error: 'invalid avatarColor' })
    }
  }
  if ('bannerId' in body) {
    const b = body.bannerId
    if (b === null || (Number.isInteger(b) && b >= 0 && b <= 5)) fields.bannerId = b
    else return res.status(400).json({ error: 'invalid bannerId' })
  }
  try {
    const user = await updateProfile(req.user.id, fields)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (err) {
    console.error('update profile failed:', err)
    res.status(500).json({ error: 'Failed to update profile' })
  }
})

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
      bio: target.bio,
      avatarColor: target.avatarColor,
      bannerId: target.bannerId,
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
