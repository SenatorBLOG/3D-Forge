import GeneratedModel from '../models/GeneratedModel.js'
import SpatialPromptRecord from '../models/SpatialPromptRecord.js'

// Session-scoped version history: an in-memory ring buffer recorded for every
// generation/edit task, so the History panel works without a database.
// With Mongo connected, /api/history reads the persisted records instead.

const MAX_ENTRIES = 100
const memory = []

export function recordTask(entry) {
  memory.unshift({
    evaluation: null,
    ...entry,
    status: 'PENDING',
    modelUrl: null,
    createdAt: new Date().toISOString(),
  })
  if (memory.length > MAX_ENTRIES) memory.pop()
}

export function updateTask(taskId, status, modelUrl) {
  const entry = memory.find((e) => e.taskId === taskId)
  if (entry) {
    entry.status = status
    entry.modelUrl = modelUrl
  }
}

/** Set the evaluation rating on a memory entry; returns true if it existed. */
export function updateEvaluation(taskId, evaluation) {
  const entry = memory.find((e) => e.taskId === taskId)
  if (!entry) return false
  entry.evaluation = evaluation
  return true
}

export function listMemory() {
  return memory
}

/**
 * Persisted history: GeneratedModel + SpatialPromptRecord merged into the
 * unified entry shape, newest first. Coalesces fields that may be missing on
 * records created before the schema gained them (.lean() skips defaults).
 */
export async function listDb(limit) {
  const [gens, edits] = await Promise.all([
    GeneratedModel.find().sort({ createdAt: -1 }).limit(limit).lean(),
    SpatialPromptRecord.find().sort({ createdAt: -1 }).limit(limit).lean(),
  ])
  return [
    ...gens.map((g) => ({
      kind: 'generate',
      taskId: g.meshyTaskId,
      prompt: g.prompt,
      status: g.status ?? 'PENDING',
      modelUrl: g.modelUrl ?? null,
      mock: g.mock ?? false,
      createdAt: g.createdAt,
    })),
    ...edits.map((e) => ({
      kind: 'edit',
      taskId: e.meshyTaskId,
      prompt: e.generatedPrompt,
      instruction: e.instruction,
      regionLabel: e.regionLabel,
      promptMode: e.promptMode ?? 'spatial',
      evaluation: e.evaluation ?? null,
      status: e.status ?? 'PENDING',
      modelUrl: e.modelUrl ?? null,
      mock: e.mock ?? false,
      createdAt: e.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
}
