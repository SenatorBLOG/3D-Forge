import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { createPost, listPosts, getPost, listTags } from '../services/posts.js'
import {
  toggleLike,
  likeInfo,
  addComment,
  listComments,
  commentCount,
} from '../services/social.js'

const router = Router()

// attach like counts / liked-by-me / comment counts to a post
const withSocial = async (post, userId) => {
  const [{ likes, likedByMe }, comments] = await Promise.all([
    likeInfo(post.id, userId),
    commentCount(post.id),
  ])
  return { ...post, likes, likedByMe, comments }
}

const str = (v) => (typeof v === 'string' ? v : undefined)

// GET /api/posts — public community feed (optional ?author / ?username / ?tag / ?q)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const posts = await listPosts({
      authorId: str(req.query.author),
      authorUsername: str(req.query.username),
      tag: str(req.query.tag),
      q: str(req.query.q),
    })
    res.json({ posts: await Promise.all(posts.map((p) => withSocial(p, req.user?.id))) })
  } catch (err) {
    console.error('list posts failed:', err)
    res.status(500).json({ error: 'Failed to list posts' })
  }
})

// GET /api/posts/tags — most-used tags for Explore's filter chips
// (declared before /:id so "tags" isn't captured as an id)
router.get('/tags', async (_req, res) => {
  try {
    res.json({ tags: await listTags() })
  } catch (err) {
    console.error('list tags failed:', err)
    res.status(500).json({ error: 'Failed to load tags' })
  }
})

// GET /api/posts/:id — a single post with social info
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    res.json({ post: await withSocial(post, req.user?.id) })
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
  const tags = Array.isArray(req.body?.tags) || typeof req.body?.tags === 'string'
    ? req.body.tags
    : []
  try {
    const post = await createPost(req.user, { title, modelUrl, description, tags })
    res.status(201).json({ post: { ...post, likes: 0, likedByMe: false, comments: 0 } })
  } catch (err) {
    console.error('create post failed:', err)
    res.status(500).json({ error: 'Failed to publish' })
  }
})

// POST /api/posts/:id/like — toggle the current user's like
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    if (!(await getPost(req.params.id))) {
      return res.status(404).json({ error: 'Post not found' })
    }
    res.json(await toggleLike(req.user.id, req.params.id))
  } catch (err) {
    console.error('toggle like failed:', err)
    res.status(500).json({ error: 'Failed to update like' })
  }
})

// GET /api/posts/:id/comments — comments oldest-first
router.get('/:id/comments', async (req, res) => {
  try {
    res.json({ comments: await listComments(req.params.id) })
  } catch (err) {
    console.error('list comments failed:', err)
    res.status(500).json({ error: 'Failed to load comments' })
  }
})

// POST /api/posts/:id/comments — add a comment (auth required)
router.post('/:id/comments', requireAuth, async (req, res) => {
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : ''
  if (body.length < 1 || body.length > 1000) {
    return res.status(400).json({ error: 'comment must be 1-1000 characters' })
  }
  try {
    if (!(await getPost(req.params.id))) {
      return res.status(404).json({ error: 'Post not found' })
    }
    res.status(201).json({ comment: await addComment(req.user, req.params.id, body) })
  } catch (err) {
    console.error('add comment failed:', err)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

export default router
