import { dbReady } from '../db.js'
import Batch from '../models/Batch.js'
import { load, flush } from './persistence.js'
import { getTask } from './meshy.js'
import { updateTask } from './history.js'

// Batch image→3D: a group of generation tasks created together and polled as
// one unit. In-memory when no Mongo (keyless dev), Mongo when connected — same
// dual-store pattern as the rest of the project.

const MAX = 100
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELED']

const memBatches = new Map() // batchId -> { batchId, ownerId, tasks, createdAt }

// Hydrate from the dev file (no-op under Mongo/tests).
{
  const saved = load('batches', null)
  if (saved) for (const [id, b] of Object.entries(saved.batches || {})) memBatches.set(id, b)
}

const saveBatches = () => {
  const batches = {}
  for (const [id, b] of memBatches) batches[id] = b
  flush('batches', { batches })
}

const publicBatch = (b) => ({
  batchId: b.batchId,
  ownerId: b.ownerId ?? null,
  tasks: (b.tasks || []).map((t) => ({ taskId: t.taskId, imageId: t.imageId })),
  createdAt: b.createdAt,
})

/** Record a new batch. `tasks` is [{ taskId, imageId }]. Returns the public batch. */
export async function createBatch({ ownerId = null, tasks }) {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const base = { batchId, ownerId, tasks }
  if (dbReady()) {
    const doc = await Batch.create(base)
    return publicBatch({ ...base, createdAt: doc.createdAt })
  }
  const b = { ...base, createdAt: new Date().toISOString() }
  memBatches.set(batchId, b)
  if (memBatches.size > MAX) memBatches.delete(memBatches.keys().next().value)
  saveBatches()
  return publicBatch(b)
}

/** Look a batch up by id, or null. */
export async function getBatch(batchId) {
  if (dbReady()) {
    const doc = await Batch.findOne({ batchId }).lean()
    return doc ? publicBatch(doc) : null
  }
  const b = memBatches.get(batchId)
  return b ? publicBatch(b) : null
}

/**
 * Poll every task in a batch. Returns null for an unknown batch, else
 * { batchId, tasks: [{ taskId, imageId, status, progress, modelUrl }],
 *   progress (0-100 average), done (all terminal) }.
 * Terminal results are mirrored into history so the panel stays in sync.
 */
export async function batchStatus(batchId) {
  const batch = await getBatch(batchId)
  if (!batch) return null
  const tasks = await Promise.all(
    batch.tasks.map(async ({ taskId, imageId }) => {
      const task = await getTask(taskId).catch(() => null)
      if (!task) return { taskId, imageId, status: 'EXPIRED', progress: 0, modelUrl: null }
      const entry = {
        taskId,
        imageId,
        status: task.status,
        progress: task.progress ?? 0,
        modelUrl: task.model_urls?.glb ?? null,
      }
      if (TERMINAL.includes(entry.status)) updateTask(taskId, entry.status, entry.modelUrl)
      return entry
    }),
  )
  const settled = (s) => TERMINAL.includes(s) || s === 'EXPIRED'
  const done = tasks.every((t) => settled(t.status))
  const progress = tasks.length
    ? Math.round(tasks.reduce((sum, t) => sum + (settled(t.status) ? 100 : t.progress), 0) / tasks.length)
    : 100
  return { batchId, tasks, progress, done }
}
