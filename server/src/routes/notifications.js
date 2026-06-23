import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { listNotifications, unreadCount, markAllRead } from '../services/notifications.js'

const router = Router()

// GET /api/notifications — recent activity + unread count (auth required)
router.get('/', requireAuth, async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      listNotifications(req.user.id),
      unreadCount(req.user.id),
    ])
    res.json({ notifications, unread })
  } catch (err) {
    console.error('list notifications failed:', err)
    res.status(500).json({ error: 'Failed to load notifications' })
  }
})

// GET /api/notifications/count — just the unread badge number (cheap to poll)
router.get('/count', requireAuth, async (req, res) => {
  try {
    res.json({ unread: await unreadCount(req.user.id) })
  } catch (err) {
    console.error('unread count failed:', err)
    res.status(500).json({ error: 'Failed to load count' })
  }
})

// POST /api/notifications/read — mark all of the user's notifications read
router.post('/read', requireAuth, async (req, res) => {
  try {
    await markAllRead(req.user.id)
    res.json({ unread: 0 })
  } catch (err) {
    console.error('mark read failed:', err)
    res.status(500).json({ error: 'Failed to update notifications' })
  }
})

export default router
