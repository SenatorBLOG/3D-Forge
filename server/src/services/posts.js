import { dbReady } from '../db.js'
import Post from '../models/Post.js'

// Persists to Mongo when connected; otherwise an in-memory ring buffer keeps the
// community feed working in keyless/mock dev.

const memPosts = [] // newest first
let memSeq = 1
const MAX = 200

const publicPost = (p) => ({
  id: p.id,
  authorId: p.authorId,
  authorUsername: p.authorUsername,
  title: p.title,
  modelUrl: p.modelUrl,
  description: p.description,
  createdAt: p.createdAt,
})

export async function createPost(user, { title, modelUrl, description }) {
  const base = {
    authorId: user.id,
    authorUsername: user.username,
    title,
    modelUrl,
    description: description || '',
  }
  if (dbReady()) {
    const doc = await Post.create(base)
    return publicPost({ ...base, id: String(doc._id), createdAt: doc.createdAt })
  }
  const p = { ...base, id: String(memSeq++), createdAt: new Date().toISOString() }
  memPosts.unshift(p)
  if (memPosts.length > MAX) memPosts.pop()
  return publicPost(p)
}

export async function listPosts({ authorId, limit = 50 } = {}) {
  if (dbReady()) {
    const docs = await Post.find(authorId ? { authorId } : {})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    return docs.map((d) => publicPost({ ...d, id: String(d._id) }))
  }
  const list = authorId ? memPosts.filter((p) => p.authorId === authorId) : memPosts
  return list.slice(0, limit).map(publicPost)
}

export async function getPost(id) {
  if (dbReady()) {
    const d = await Post.findById(id)
      .lean()
      .catch(() => null)
    return d ? publicPost({ ...d, id: String(d._id) }) : null
  }
  const p = memPosts.find((x) => x.id === id)
  return p ? publicPost(p) : null
}
