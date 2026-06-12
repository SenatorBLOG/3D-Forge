// Client for the Meshy text-to-3D API (https://docs.meshy.ai/en/api/text-to-3d).
// Without MESHY_API_KEY (or with MESHY_API_KEY=mock) a built-in mock simulates
// the task lifecycle, resolving to the bundled robotic hand — so the whole
// pipeline works in development without spending Meshy credits.

const BASE_URL = 'https://api.meshy.ai/openapi/v2/text-to-3d'

const apiKey = () => process.env.MESHY_API_KEY

export const isMockMode = () => !apiKey() || apiKey() === 'mock'

// --- mock implementation -------------------------------------------------

const MOCK_DURATION_MS = 8000
const mockTasks = new Map()

function createMockTask(prompt) {
  const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  mockTasks.set(id, { prompt, startedAt: Date.now() })
  return id
}

function getMockTask(id) {
  const task = mockTasks.get(id)
  if (!task) return null
  const elapsed = Date.now() - task.startedAt
  const progress = Math.min(100, Math.round((elapsed / MOCK_DURATION_MS) * 100))
  const done = progress >= 100
  return {
    id,
    status: done ? 'SUCCEEDED' : elapsed < 500 ? 'PENDING' : 'IN_PROGRESS',
    progress,
    model_urls: done ? { glb: '/models/robotic_hand.glb' } : {},
  }
}

// --- real implementation --------------------------------------------------

async function meshyFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Meshy API ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Start a text-to-3D preview task; resolves to the Meshy task id. */
export async function createPreviewTask(prompt) {
  if (isMockMode()) return createMockTask(prompt)
  const data = await meshyFetch('', {
    method: 'POST',
    body: JSON.stringify({ mode: 'preview', prompt }),
  })
  return data.result
}

/**
 * Fetch a task. Resolves to the Meshy task object ({ id, status, progress,
 * model_urls, ... }) or null when the id is unknown (mock mode only — the
 * real API answers 404 itself, surfaced as a thrown error).
 */
export async function getTask(id) {
  if (isMockMode()) return getMockTask(id)
  return meshyFetch(`/${encodeURIComponent(id)}`)
}
