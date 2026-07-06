import { dbReady } from '../db.js'
import Favorite from '../models/Favorite.js'
import { load, flush } from './persistence.js'

// Library favorites: which generation taskIds a user starred. In-memory when no
// Mongo (keyless dev), Mongo when connected — same dual-store pattern as the
// rest of the project.

const memFavs = new Set() // "userId>taskId"

// Hydrate from the dev file (no-op under Mongo/tests).
{
  const saved = load('favorites', null)
  if (Array.isArray(saved)) for (const k of saved) memFavs.add(k)
}

const key = (u, t) => `${u}>${t}`
const saveFavs = () => flush('favorites', [...memFavs])

/** Star/unstar a model for a user. Returns { favorite } — the new state. */
export async function toggleFavorite(userId, taskId) {
  if (dbReady()) {
    const existing = await Favorite.findOne({ userId, taskId })
    if (existing) await Favorite.deleteOne({ _id: existing._id })
    else await Favorite.create({ userId, taskId })
    return { favorite: !existing }
  }
  const k = key(userId, taskId)
  const favorite = !memFavs.has(k)
  if (favorite) memFavs.add(k)
  else memFavs.delete(k)
  saveFavs()
  return { favorite }
}

/** The set of taskIds `userId` starred (Set<string>). */
export async function favoriteIds(userId) {
  if (!userId) return new Set()
  if (dbReady()) {
    const docs = await Favorite.find({ userId }).lean()
    return new Set(docs.map((d) => d.taskId))
  }
  const out = new Set()
  const prefix = `${userId}>`
  for (const k of memFavs) if (k.startsWith(prefix)) out.add(k.slice(prefix.length))
  return out
}
