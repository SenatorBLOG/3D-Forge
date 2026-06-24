import { dbReady } from '../db.js'
import Notification from '../models/Notification.js'
import { load, flush } from './persistence.js'

// Activity notifications. In-memory when no Mongo (keyless dev), Mongo when
// connected — same dual-store pattern as the rest of the project.

const memNotifs = [] // newest first
let memSeq = 1
const MAX = 500

// Hydrate from the dev file (no-op under Mongo/tests).
{
  const saved = load('notifications', null)
  if (saved) {
    memNotifs.push(...(saved.notifs || []).slice(0, MAX))
    memSeq = saved.seq ?? memSeq
  }
}

const saveNotifs = () =>
  flush('notifications', { notifs: memNotifs, seq: memSeq })

const publicNotif = (n) => ({
  id: n.id,
  type: n.type,
  actorUsername: n.actorUsername,
  postId: n.postId,
  postTitle: n.postTitle,
  read: n.read,
  createdAt: n.createdAt,
})

// Create a notification for `recipientId` about `actor`'s action. No-op when you
// act on your own post — you don't get notified about yourself.
export async function notify({ recipientId, type, actor, postId, postTitle }) {
  if (!recipientId || recipientId === actor?.id) return null
  const base = {
    userId: recipientId,
    type,
    actorId: actor.id,
    actorUsername: actor.username,
    postId,
    postTitle: postTitle || '',
    read: false,
  }
  if (dbReady()) {
    const doc = await Notification.create(base)
    return publicNotif({ ...base, id: String(doc._id), createdAt: doc.createdAt })
  }
  const n = { ...base, id: String(memSeq++), createdAt: new Date().toISOString() }
  memNotifs.unshift(n)
  if (memNotifs.length > MAX) memNotifs.pop()
  saveNotifs()
  return publicNotif(n)
}

export async function listNotifications(userId, { limit = 30 } = {}) {
  if (dbReady()) {
    const docs = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
    return docs.map((d) => publicNotif({ ...d, id: String(d._id) }))
  }
  return memNotifs
    .filter((n) => n.userId === userId)
    .slice(0, limit)
    .map(publicNotif)
}

export async function unreadCount(userId) {
  if (dbReady()) return Notification.countDocuments({ userId, read: false })
  return memNotifs.filter((n) => n.userId === userId && !n.read).length
}

export async function markAllRead(userId) {
  if (dbReady()) {
    await Notification.updateMany({ userId, read: false }, { read: true })
    return
  }
  let changed = false
  for (const n of memNotifs) {
    if (n.userId === userId && !n.read) {
      n.read = true
      changed = true
    }
  }
  if (changed) saveNotifs()
}

// Drop notifications that point at a post (called when the post is deleted).
export async function removePostNotifications(postId) {
  if (dbReady()) {
    await Notification.deleteMany({ postId })
    return
  }
  let changed = false
  for (let i = memNotifs.length - 1; i >= 0; i--) {
    if (memNotifs[i].postId === postId) {
      memNotifs.splice(i, 1)
      changed = true
    }
  }
  if (changed) saveNotifs()
}
