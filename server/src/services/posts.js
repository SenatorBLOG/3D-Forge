import { dbReady } from '../db.js'
import Post from '../models/Post.js'
import { load, flush } from './persistence.js'

// Persists to Mongo when connected; otherwise an in-memory ring buffer keeps the
// community feed working in keyless/mock dev.

const memPosts = [] // newest first
let memSeq = 1
const MAX = 200
const MAX_TAGS = 6

// Hydrate from the dev file (no-op under Mongo/tests).
{
  const saved = load('posts', null)
  if (saved) {
    memPosts.push(...(saved.posts || []).slice(0, MAX))
    memSeq = saved.seq ?? memSeq
  }
}

const savePosts = () => flush('posts', { posts: memPosts, seq: memSeq })

// "#Robot, sci fi" → ['robot', 'sci-fi']: lowercase, hyphenate spaces, drop
// leading '#', keep [a-z0-9-], dedupe, cap length + count.
export function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(',')
      : []
  const seen = new Set()
  const out = []
  for (const t of raw) {
    const tag = String(t)
      .trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
    if (!/^[a-z0-9][a-z0-9-]*$/.test(tag) || tag.length > 24 || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const publicPost = (p) => ({
  id: p.id,
  authorId: p.authorId,
  authorUsername: p.authorUsername,
  title: p.title,
  modelUrl: p.modelUrl,
  description: p.description,
  tags: p.tags || [],
  kind: p.kind ?? null,
  createdAt: p.createdAt,
})

// generation type for the card badge; anything but 'text'/'image' stores null
const normalizeKind = (kind) => (kind === 'text' || kind === 'image' ? kind : null)

export async function createPost(user, { title, modelUrl, description, tags, kind }) {
  const base = {
    authorId: user.id,
    authorUsername: user.username,
    title,
    modelUrl,
    description: description || '',
    tags: normalizeTags(tags),
    kind: normalizeKind(kind),
  }
  if (dbReady()) {
    const doc = await Post.create(base)
    return publicPost({ ...base, id: String(doc._id), createdAt: doc.createdAt })
  }
  const p = { ...base, id: String(memSeq++), createdAt: new Date().toISOString() }
  memPosts.unshift(p)
  if (memPosts.length > MAX) memPosts.pop()
  savePosts()
  return publicPost(p)
}

export async function listPosts({
  authorId,
  authorIds,
  authorUsername,
  ids, // restrict to these post ids (profile Favorites: the posts a user liked)
  tag,
  anyTags, // match posts carrying ANY of these tags (theme filtering, B9)
  q,
  limit = 50,
} = {}) {
  const query = typeof q === 'string' ? q.trim().toLowerCase() : ''
  const wantTag = tag ? normalizeTags(tag)[0] : undefined
  const wantAny = Array.isArray(anyTags) && anyTags.length ? normalizeTags(anyTags) : undefined
  // an empty authorIds/ids list means "matches nothing", not "all posts"
  if (authorIds && authorIds.length === 0) return []
  if (ids && ids.length === 0) return []
  if (dbReady()) {
    const filter = {}
    if (authorId) filter.authorId = authorId
    if (authorIds) filter.authorId = { $in: authorIds }
    // drop anything that can't be a Mongo id so a mem-mode id never throws a CastError
    if (ids) filter._id = { $in: ids.filter((i) => /^[0-9a-f]{24}$/i.test(i)) }
    if (authorUsername) filter.authorUsername = authorUsername
    if (wantTag) filter.tags = wantTag
    if (wantAny) filter.tags = { ...(wantTag ? { $eq: wantTag } : {}), $in: wantAny }
    if (query) {
      const rx = new RegExp(escapeRegex(query), 'i')
      filter.$or = [{ title: rx }, { tags: rx }]
    }
    const docs = await Post.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
    return docs.map((d) => publicPost({ ...d, id: String(d._id) }))
  }
  const idSet = authorIds ? new Set(authorIds) : null
  const postIdSet = ids ? new Set(ids) : null
  const list = memPosts.filter((p) => {
    if (authorId && p.authorId !== authorId) return false
    if (idSet && !idSet.has(p.authorId)) return false
    if (postIdSet && !postIdSet.has(p.id)) return false
    if (authorUsername && p.authorUsername !== authorUsername) return false
    if (wantTag && !(p.tags || []).includes(wantTag)) return false
    if (wantAny && !(p.tags || []).some((t) => wantAny.includes(t))) return false
    if (query) {
      // mirror the Mongo $or: match within the title OR within a single tag,
      // never across the title/tag seam
      const inTitle = p.title.toLowerCase().includes(query)
      const inTag = (p.tags || []).some((t) => t.toLowerCase().includes(query))
      if (!inTitle && !inTag) return false
    }
    return true
  })
  return list.slice(0, limit).map(publicPost)
}

// Most-used tags across the gallery, for Explore's filter chips.
export async function listTags(limit = 12) {
  if (dbReady()) {
    const docs = await Post.aggregate([
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: limit },
    ])
    return docs.map((d) => ({ tag: d._id, count: d.count }))
  }
  const counts = new Map()
  for (const p of memPosts) {
    for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }))
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

// Patch a post's editable fields (only those present in `fields`). Caller
// enforces ownership. Returns the updated public post, or null if it's gone.
export async function updatePost(id, fields) {
  const patch = {}
  if (fields.title !== undefined) patch.title = fields.title
  if (fields.description !== undefined) patch.description = fields.description
  if (fields.tags !== undefined) patch.tags = normalizeTags(fields.tags)
  if (dbReady()) {
    const d = await Post.findByIdAndUpdate(id, patch, { new: true })
      .lean()
      .catch(() => null)
    return d ? publicPost({ ...d, id: String(d._id) }) : null
  }
  const p = memPosts.find((x) => x.id === id)
  if (!p) return null
  Object.assign(p, patch)
  savePosts()
  return publicPost(p)
}

export async function deletePost(id) {
  if (dbReady()) {
    const r = await Post.findByIdAndDelete(id).catch(() => null)
    return !!r
  }
  const i = memPosts.findIndex((x) => x.id === id)
  if (i === -1) return false
  memPosts.splice(i, 1)
  savePosts()
  return true
}
