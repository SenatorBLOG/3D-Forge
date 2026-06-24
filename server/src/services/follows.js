import { dbReady } from '../db.js'
import Follow from '../models/Follow.js'
import { load, flush } from './persistence.js'

// Social graph: who follows whom. In-memory when no Mongo, Mongo when connected
// — same dual-store pattern as the rest of the project.

const memFollows = new Set() // "followerId>followingId"

// Hydrate from the dev file (no-op under Mongo/tests).
{
  const saved = load('follows', null)
  if (Array.isArray(saved)) for (const k of saved) memFollows.add(k)
}

const key = (a, b) => `${a}>${b}`
const saveFollows = () => flush('follows', [...memFollows])

// Toggle: follow if not already, unfollow if so. No self-follows.
// Returns { following, followers } (the target's new follower count).
export async function toggleFollow(followerId, followingId) {
  if (followerId === followingId) {
    return { following: false, followers: await countFollowers(followingId) }
  }
  if (dbReady()) {
    const existing = await Follow.findOne({ followerId, followingId })
    if (existing) await Follow.deleteOne({ _id: existing._id })
    else await Follow.create({ followerId, followingId })
    return { following: !existing, followers: await countFollowers(followingId) }
  }
  const k = key(followerId, followingId)
  const following = !memFollows.has(k)
  if (following) memFollows.add(k)
  else memFollows.delete(k)
  saveFollows()
  return { following, followers: await countFollowers(followingId) }
}

export async function isFollowing(followerId, followingId) {
  if (!followerId) return false
  if (dbReady()) return !!(await Follow.exists({ followerId, followingId }))
  return memFollows.has(key(followerId, followingId))
}

async function countFollowers(userId) {
  if (dbReady()) return Follow.countDocuments({ followingId: userId })
  let n = 0
  for (const k of memFollows) if (k.endsWith(`>${userId}`)) n++
  return n
}

async function countFollowing(userId) {
  if (dbReady()) return Follow.countDocuments({ followerId: userId })
  let n = 0
  for (const k of memFollows) if (k.startsWith(`${userId}>`)) n++
  return n
}

export async function followCounts(userId) {
  const [followers, following] = await Promise.all([
    countFollowers(userId),
    countFollowing(userId),
  ])
  return { followers, following }
}

// The ids of everyone `userId` follows — for the Following feed.
export async function followingIds(userId) {
  if (dbReady()) {
    const docs = await Follow.find({ followerId: userId }).lean()
    return docs.map((d) => d.followingId)
  }
  const out = []
  const prefix = `${userId}>`
  for (const k of memFollows) if (k.startsWith(prefix)) out.push(k.slice(prefix.length))
  return out
}
