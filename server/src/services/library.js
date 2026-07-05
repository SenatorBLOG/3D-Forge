import { dbReady } from '../db.js'
import GeneratedModel from '../models/GeneratedModel.js'
import { listMemory } from './history.js'
import { favoriteIds } from './favorites.js'

// The "My generations" library: a queryable, paginated view over generations.
// Mock mode reads the in-memory history ring buffer; with Mongo connected it
// reads the persisted GeneratedModel records. Same item shape either way.

const MAX_LIMIT = 100

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const item = (e, favs) => ({
  taskId: e.taskId,
  prompt: e.prompt ?? '',
  status: e.status ?? 'PENDING',
  modelUrl: e.modelUrl ?? null,
  mock: e.mock ?? false,
  ownerId: e.ownerId ?? null,
  favorite: favs.has(e.taskId),
  createdAt: e.createdAt,
})

/**
 * List library models.
 *  - owner: 'all' (default) or 'me' (requires userId — caller enforces auth)
 *  - onlyFavorites: keep just the caller's starred models (requires userId)
 *  - q: case-insensitive substring match on the prompt
 *  - limit/offset: pagination (limit capped at 100)
 * Returns { models, total } where total counts matches before pagination.
 */
export async function listLibrary({
  userId = null,
  owner = 'all',
  onlyFavorites = false,
  q = '',
  limit = 20,
  offset = 0,
} = {}) {
  limit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIMIT)
  offset = Math.max(Number(offset) || 0, 0)
  const query = typeof q === 'string' ? q.trim().toLowerCase() : ''
  const favs = await favoriteIds(userId)

  if (dbReady()) {
    const filter = {}
    if (owner === 'me') filter.ownerId = userId
    if (onlyFavorites) filter.meshyTaskId = { $in: [...favs] }
    if (query) filter.prompt = new RegExp(escapeRegex(query), 'i')
    const [docs, total] = await Promise.all([
      GeneratedModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      GeneratedModel.countDocuments(filter),
    ])
    return {
      models: docs.map((d) => item({ ...d, taskId: d.meshyTaskId }, favs)),
      total,
    }
  }

  // mock: history holds generations newest-first (kind 'generate' = library items)
  const all = listMemory().filter((e) => {
    if (e.kind !== 'generate') return false
    if (owner === 'me' && e.ownerId !== userId) return false
    if (onlyFavorites && !favs.has(e.taskId)) return false
    if (query && !(e.prompt || '').toLowerCase().includes(query)) return false
    return true
  })
  return { models: all.slice(offset, offset + limit).map((e) => item(e, favs)), total: all.length }
}
