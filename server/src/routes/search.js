import { Router } from 'express'
import { listPosts } from '../services/posts.js'
import { searchUsers } from '../services/auth.js'

const router = Router()

// GET /api/search?q=<text>&limit=<1..50> — one box, everything: posts by
// title/tag (reuses listPosts' q matching) plus creators by username.
router.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!q) return res.status(400).json({ error: 'q (non-empty string) is required' })
  if (q.length > 100) return res.status(400).json({ error: 'q must be 100 characters or fewer' })
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50)
  try {
    const [posts, users] = await Promise.all([
      listPosts({ q, limit }),
      searchUsers(q, Math.min(limit, 10)),
    ])
    res.json({
      q,
      posts,
      creators: users.map((u) => ({
        username: u.username,
        bio: u.bio || '',
        avatarColor: u.avatarColor ?? null,
      })),
    })
  } catch (err) {
    console.error('search failed:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

export default router
