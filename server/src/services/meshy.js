// Client for the Meshy text-to-3D API (https://docs.meshy.ai/en/api/text-to-3d).
// Without MESHY_API_KEY (or with MESHY_API_KEY=mock) a built-in mock simulates
// the task lifecycle, resolving to the bundled robotic hand — so the whole
// pipeline works in development without spending Meshy credits.

const TEXT_URL = 'https://api.meshy.ai/openapi/v2/text-to-3d'
const IMAGE_URL = 'https://api.meshy.ai/openapi/v1/image-to-3d'

const apiKey = () => process.env.MESHY_API_KEY

export const isMockMode = () => !apiKey() || apiKey() === 'mock'

// --- cost guard: cap real (credit-spending) generations per day ----------
// Mock mode is never limited. The counter lives in memory: it resets daily and
// also resets on server restart, so the developer can always get past it by
// raising MESHY_DAILY_LIMIT or restarting. Protects against runaway loops / a
// tester accidentally burning the Meshy credit balance.
const DAILY_LIMIT = Number(process.env.MESHY_DAILY_LIMIT || 15)
let limitDay = ''
let usedToday = 0

function enforceDailyLimit() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== limitDay) {
    limitDay = today
    usedToday = 0
  }
  if (usedToday >= DAILY_LIMIT) {
    const err = new Error(
      `Daily real-generation limit reached (${DAILY_LIMIT}). ` +
        'Raise MESHY_DAILY_LIMIT in server/.env or restart the server.',
    )
    err.code = 'DAILY_LIMIT'
    err.status = 429
    throw err
  }
  usedToday += 1
}

// --- mock implementation -------------------------------------------------

const MOCK_DURATION_MS = 8000
const MOCK_RETENTION_MS = 10 * 60 * 1000
const mockTasks = new Map()

// exported so other engines (services/tripo.js) reuse the same key-free mock
export function createMockTask(label) {
  // sweep stale entries so a long-lived dev server doesn't grow forever,
  // while finished tasks stay pollable for a while
  const cutoff = Date.now() - MOCK_RETENTION_MS
  for (const [key, value] of mockTasks) {
    if (value.startedAt < cutoff) mockTasks.delete(key)
  }
  const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  mockTasks.set(id, { label, startedAt: Date.now() })
  return id
}

export function getMockTask(id) {
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

async function meshyFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Meshy API ${res.status}: ${body.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Poll one task type; resolves to the task object, or null on 404 (unknown id
// for that endpoint) so getTask can try the other type.
async function fetchTaskFrom(baseUrl, id) {
  try {
    return await meshyFetch(`${baseUrl}/${encodeURIComponent(id)}`)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
}

/**
 * Start a text-to-3D preview task; resolves to the Meshy task id.
 * `aiModel` is 'meshy-5' (cheap, default) or 'meshy-6' (prettier, more credits).
 */
export async function createPreviewTask(prompt, aiModel = 'meshy-5') {
  if (isMockMode()) return createMockTask(prompt)
  enforceDailyLimit() // throws DAILY_LIMIT once the daily cap is hit
  const data = await meshyFetch(TEXT_URL, {
    method: 'POST',
    body: JSON.stringify({ mode: 'preview', prompt, ai_model: aiModel }),
  })
  return data.result
}

/**
 * Start an image-to-3D task from a reference image. `imageInput` is a Meshy-
 * reachable image: a data URI (we pass one, since our /images URLs are
 * localhost-only) or a public URL. Resolves to the (new) Meshy task id.
 */
export async function createImageTask(imageInput, { aiModel = 'meshy-5' } = {}) {
  if (isMockMode()) return createMockTask('image-to-3d')
  enforceDailyLimit()
  const data = await meshyFetch(IMAGE_URL, {
    method: 'POST',
    body: JSON.stringify({ image_url: imageInput, ai_model: aiModel, enable_pbr: true }),
  })
  return data.result
}

/**
 * Start a text-to-3D refine task from a SUCCEEDED preview — this is the stage
 * that adds color/textures. Resolves to the (new) Meshy task id.
 */
export async function createRefineTask(previewTaskId, { aiModel = 'meshy-5' } = {}) {
  if (isMockMode()) return createMockTask('refine')
  const data = await meshyFetch(TEXT_URL, {
    method: 'POST',
    body: JSON.stringify({
      mode: 'refine',
      preview_task_id: previewTaskId,
      ai_model: aiModel,
      enable_pbr: true,
      target_formats: ['glb'],
    }),
  })
  return data.result
}

/**
 * Fetch a task. Resolves to the Meshy task object ({ id, status, progress,
 * model_urls, ... }) or null when the id is unknown — in both mock and real
 * mode, so the route can answer a uniform 404.
 */
export async function getTask(id) {
  if (isMockMode()) return getMockTask(id)
  // a task id doesn't encode its type, so try text-to-3d then fall back to
  // image-to-3d; null only when neither endpoint knows the id (uniform 404).
  const fromText = await fetchTaskFrom(TEXT_URL, id)
  return fromText ?? (await fetchTaskFrom(IMAGE_URL, id))
}
