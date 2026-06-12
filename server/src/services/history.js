// Session-scoped version history: an in-memory ring buffer recorded for every
// generation/edit task, so the History panel works without a database.
// With Mongo connected, /api/history reads the persisted records instead.

const MAX_ENTRIES = 100
const memory = []

export function recordTask(entry) {
  memory.unshift({
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

export function listMemory() {
  return memory
}
