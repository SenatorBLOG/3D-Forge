import { dbReady } from '../db.js'
import Like from '../models/Like.js'
import Comment from '../models/Comment.js'
import { load, flush } from './persistence.js'

// Likes and comments on posts. In-memory when no Mongo (keyless dev), Mongo when
// connected — same dual-store pattern as the rest of the project.

const memLikes = new Map() // postId -> Set(userId)
const memComments = new Map() // postId -> [comment]
let memCommentSeq = 1

// Hydrate from the dev file (no-op under Mongo/tests). Map<postId,Set> and
// Map<postId,[]> are stored as plain { postId: [...] } objects.
{
  const saved = load('social', null)
  if (saved) {
    for (const [postId, userIds] of Object.entries(saved.likes || {})) {
      memLikes.set(postId, new Set(userIds))
    }
    for (const [postId, comments] of Object.entries(saved.comments || {})) {
      memComments.set(postId, comments)
    }
    memCommentSeq = saved.commentSeq ?? memCommentSeq
  }
}

const saveSocial = () => {
  const likes = {}
  for (const [postId, set] of memLikes) likes[postId] = [...set]
  const comments = {}
  for (const [postId, arr] of memComments) comments[postId] = arr
  flush('social', { likes, comments, commentSeq: memCommentSeq })
}

// --- likes ---

export async function toggleLike(userId, postId) {
  if (dbReady()) {
    const existing = await Like.findOne({ postId, userId })
    if (existing) await Like.deleteOne({ _id: existing._id })
    else await Like.create({ postId, userId })
    return { liked: !existing, likes: await Like.countDocuments({ postId }) }
  }
  let set = memLikes.get(postId)
  if (!set) {
    set = new Set()
    memLikes.set(postId, set)
  }
  const liked = !set.has(userId)
  if (liked) set.add(userId)
  else set.delete(userId)
  saveSocial()
  return { liked, likes: set.size }
}

export async function likeInfo(postId, userId) {
  if (dbReady()) {
    return {
      likes: await Like.countDocuments({ postId }),
      likedByMe: userId ? !!(await Like.exists({ postId, userId })) : false,
    }
  }
  const set = memLikes.get(postId)
  return {
    likes: set ? set.size : 0,
    likedByMe: !!(userId && set && set.has(userId)),
  }
}

// --- comments ---

const publicComment = (c) => ({
  id: c.id,
  authorId: c.authorId,
  authorUsername: c.authorUsername,
  body: c.body,
  createdAt: c.createdAt,
})

export async function addComment(user, postId, body) {
  const base = { postId, authorId: user.id, authorUsername: user.username, body }
  if (dbReady()) {
    const doc = await Comment.create(base)
    return publicComment({ ...base, id: String(doc._id), createdAt: doc.createdAt })
  }
  let arr = memComments.get(postId)
  if (!arr) {
    arr = []
    memComments.set(postId, arr)
  }
  const c = { ...base, id: String(memCommentSeq++), createdAt: new Date().toISOString() }
  arr.push(c)
  saveSocial()
  return publicComment(c)
}

export async function listComments(postId) {
  if (dbReady()) {
    const docs = await Comment.find({ postId }).sort({ createdAt: 1 }).lean()
    return docs.map((d) => publicComment({ ...d, id: String(d._id) }))
  }
  return (memComments.get(postId) || []).map(publicComment)
}

export async function commentCount(postId) {
  if (dbReady()) return Comment.countDocuments({ postId })
  return (memComments.get(postId) || []).length
}

// Drop all likes + comments for a post (called when the post is deleted).
export async function removePostSocial(postId) {
  if (dbReady()) {
    await Promise.all([Like.deleteMany({ postId }), Comment.deleteMany({ postId })])
    return
  }
  const had = memLikes.delete(postId)
  const had2 = memComments.delete(postId)
  if (had || had2) saveSocial()
}
