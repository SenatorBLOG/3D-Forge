import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import {
  createPost,
  listPosts,
  getPost,
  listTags,
  updatePost,
  deletePost,
} from '../services/posts.js'
import {
  toggleLike,
  likeInfo,
  likedPostIds,
  addComment,
  listComments,
  commentCount,
  removePostSocial,
} from '../services/social.js'
import { getUserByUsername } from '../services/auth.js'
import { notify, removePostNotifications } from '../services/notifications.js'
import { followingIds } from '../services/follows.js'
import { getTheme, THEMES } from '../services/themes.js'

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

// GET /api/posts — public community feed.
// Filters: ?author / ?username / ?tag / ?theme / ?q / ?likedBy=<username>,
// or ?following=1 for your follows' posts
router.get('/', optionalAuth, async (req, res) => {
  try {
    // ?following=1 → only posts by people the signed-in user follows. Anonymous
    // callers get an empty set (not the whole feed) so the filter never leaks.
    let authorIds
    if (req.query.following === '1') {
      authorIds = req.user ? await followingIds(req.user.id) : []
    }
    // ?likedBy=<username> → the posts that user has liked (profile Favorites tab).
    // Likes are public counts already, so this exposes nothing new.
    let ids
    if (str(req.query.likedBy)) {
      const target = await getUserByUsername(req.query.likedBy)
      ids = target ? await likedPostIds(target.id) : []
    }
    // ?theme=<id> → posts carrying any of the theme's curated tags
    let anyTags
    if (req.query.theme !== undefined) {
      const theme = getTheme(str(req.query.theme))
      if (!theme) {
        return res
          .status(400)
          .json({ error: `unknown theme — valid ids: ${THEMES.map((t) => t.id).join(', ')}` })
      }
      anyTags = theme.tags
    }
    const posts = await listPosts({
      authorId: str(req.query.author),
      authorIds,
      ids,
      authorUsername: str(req.query.username),
      tag: str(req.query.tag),
      anyTags,
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
  // optional generation-type badge; a bad value is dropped (null), never a 400
  const kind = req.body?.kind === 'text' || req.body?.kind === 'image' ? req.body.kind : null
  try {
    const post = await createPost(req.user, { title, modelUrl, description, tags, kind })
    res.status(201).json({ post: { ...post, likes: 0, likedByMe: false, comments: 0 } })
  } catch (err) {
    console.error('create post failed:', err)
    res.status(500).json({ error: 'Failed to publish' })
  }
})

// PATCH /api/posts/:id — edit your own post's title / description / tags
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own posts' })
    }
    const fields = {}
    if (typeof req.body?.title === 'string') {
      const title = req.body.title.trim()
      if (title.length < 1 || title.length > 120) {
        return res.status(400).json({ error: 'title must be 1-120 characters' })
      }
      fields.title = title
    }
    if (typeof req.body?.description === 'string') {
      fields.description = req.body.description.slice(0, 600)
    }
    if (Array.isArray(req.body?.tags) || typeof req.body?.tags === 'string') {
      fields.tags = req.body.tags
    }
    const updated = await updatePost(req.params.id, fields)
    res.json({ post: await withSocial(updated, req.user.id) })
  } catch (err) {
    console.error('update post failed:', err)
    res.status(500).json({ error: 'Failed to update post' })
  }
})

// DELETE /api/posts/:id — delete your own post (and its likes/comments/notifs)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    if (post.authorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own posts' })
    }
    await deletePost(req.params.id)
    await removePostSocial(req.params.id)
    await removePostNotifications(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('delete post failed:', err)
    res.status(500).json({ error: 'Failed to delete post' })
  }
})

// POST /api/posts/:id/like — toggle the current user's like
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    const result = await toggleLike(req.user.id, req.params.id)
    if (result.liked) {
      // a like notifies the author; an unlike doesn't. Never fail the like itself.
      try {
        await notify({
          recipientId: post.authorId,
          type: 'like',
          actor: req.user,
          postId: post.id,
          postTitle: post.title,
        })
      } catch (e) {
        console.error('notify (like) failed:', e)
      }
    }
    res.json(result)
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
    const post = await getPost(req.params.id)
    if (!post) return res.status(404).json({ error: 'Post not found' })
    const comment = await addComment(req.user, req.params.id, body)
    try {
      await notify({
        recipientId: post.authorId,
        type: 'comment',
        actor: req.user,
        postId: post.id,
        postTitle: post.title,
      })
    } catch (e) {
      console.error('notify (comment) failed:', e)
    }
    res.status(201).json({ comment })
  } catch (err) {
    console.error('add comment failed:', err)
    res.status(500).json({ error: 'Failed to add comment' })
  }
})

export default router
