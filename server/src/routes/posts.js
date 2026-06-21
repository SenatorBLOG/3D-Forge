import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { createPost, listPosts, getPost } from '../services/posts.js'

const router = Router()

// GET /api/posts — public community feed (optional ?author=<id>)
router.get('/', async (req, res) => {
  try {
    const authorId = typeof req.query.author === 'string' ? req.query.author : undefined
    res.json({ posts: await listPosts({ authorId }) })
  } catch (err) {
    console.error('list posts failed:', err)
    res.status(500).json({ error: 'Failed to list posts' })
  }
})

// GET /api/posts/:id — a single post
router.get('/:id', async (req, res) => {
  try {
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    res.json({ post })
  } catch (err) {
    console.error('get post failed:', err)
    res.status(500).json({ error: 'Failed to load post' })
  }
})

// POST /api/posts — publish the current model (auth required)
router.post('/', requireAuth, async (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : ''
  const modelUrl = typeof req.body?.modelUrl === 'string' ? req.body.modelUrl : ''
  const description =
    typeof req.body?.description === 'string' ? req.body.description.slice(0, 600) : ''
  if (title.length < 1 || title.length > 120) {
    return res.status(400).json({ error: 'title must be 1-120 characters' })
  }
  if (!/^(https?:\/\/|\/)/.test(modelUrl) || modelUrl.length > 2048) {
    return res.status(400).json({ error: 'a valid modelUrl is required' })
  }
  try {
    const post = await createPost(req.user, { title, modelUrl, description })
    res.status(201).json({ post })
  } catch (err) {
    console.error('create post failed:', err)
    res.status(500).json({ error: 'Failed to publish' })
  }
})

export default router
