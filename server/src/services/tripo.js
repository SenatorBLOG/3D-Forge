// Client for the Tripo3D generation API (https://platform.tripo3d.ai/docs).
// Second generation engine alongside Meshy: users pick the engine per
// generation. Without TRIPO_API_KEY (or =mock) it reuses the same built-in
// mock task lifecycle as Meshy, so the pipeline stays key-free for the demo.
//
// NOTE: written against the public docs/SDK; not yet exercised against the
// live API (no key on this machine) — statuses/shapes mapped per docs.

import { createMockTask, getMockTask } from './meshy.js'

const BASE_URL = 'https://api.tripo3d.ai/v2/openapi'

const apiKey = () => process.env.TRIPO_API_KEY

export const isTripoMock = () => !apiKey() || apiKey() === 'mock'

// --- cost guard: cap real (credit-spending) generations per day ----------
// Same pragmatic pattern as MESHY_DAILY_LIMIT / IMAGE_DAILY_LIMIT.
const DAILY_LIMIT = () => Number(process.env.TRIPO_DAILY_LIMIT || 10)
let limitDay = ''
let usedToday = 0

function enforceDailyLimit() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== limitDay) {
    limitDay = today
    usedToday = 0
  }
  if (usedToday >= DAILY_LIMIT()) {
    const err = new Error(
      `Daily Tripo generation limit reached (${DAILY_LIMIT()}). ` +
        'Raise TRIPO_DAILY_LIMIT in server/.env or restart the server.',
    )
    err.code = 'DAILY_LIMIT'
    err.status = 429
    throw err
  }
  usedToday += 1
}

async function tripoFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...(options.body && typeof options.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`Tripo API ${res.status}: ${body.slice(0, 300)}`)
    err.status = res.status
    throw err
  }
  const data = await res.json()
  if (data.code !== 0) {
    throw new Error(`Tripo API error code ${data.code}: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return data.data
}

/** Start a text→3D task; resolves to the Tripo task id. */
export async function createTripoTextTask(prompt) {
  if (isTripoMock()) return createMockTask(prompt)
  enforceDailyLimit()
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({ type: 'text_to_model', prompt }),
  })
  return data.task_id
}

/**
 * Start an image→3D task from raw image bytes. Tripo can't fetch our localhost
 * URLs, so the bytes are uploaded first (multipart → file token).
 */
export async function createTripoImageTask(imageBytes, mime = 'image/png') {
  if (isTripoMock()) return createMockTask('image-to-3d')
  enforceDailyLimit()
  const form = new FormData()
  const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png'
  form.append('file', new Blob([imageBytes], { type: mime }), `reference.${ext}`)
  const uploaded = await tripoFetch('/upload', { method: 'POST', body: form })
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'image_to_model',
      file: { type: ext, file_token: uploaded.image_token },
    }),
  })
  return data.task_id
}

/**
 * Start a multi-view→3D task (P1.5 fidelity path): several views of the SAME
 * object (e.g. edited front + original side/back) reconstruct one model that
 * keeps the original body far better than a single view. `views` is an ordered
 * array of { bytes, mime } for [front, left, back, right] (trailing slots may be
 * omitted). Each is uploaded to a file token, then a `multiview_to_model` task is
 * created. Mock-safe (no key → mock task), so the flow demos without Tripo.
 *
 * NOTE: mapped from the public docs; not yet exercised against the live API.
 */
export async function createTripoMultiviewTask(views) {
  if (isTripoMock()) return createMockTask('multiview-to-3d')
  enforceDailyLimit()
  // verified 2026-07-18: `files` must be EXACTLY 4 slots [front, left, back,
  // right]; missing views are empty `{}` (2 real + 2 `{}` was accepted, 2-only
  // gave code 1004). Each present slot is { type:'jpg'|'png', file_token };
  // webp is not accepted.
  const files = []
  for (const v of views.slice(0, 4)) {
    if (!v?.bytes) {
      files.push({})
      continue
    }
    const ext = v.mime?.includes('png') ? 'png' : 'jpg'
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg'
    const form = new FormData()
    form.append('file', new Blob([v.bytes], { type: mime }), `view.${ext}`)
    const uploaded = await tripoFetch('/upload', { method: 'POST', body: form })
    files.push({ type: ext, file_token: uploaded.image_token })
  }
  while (files.length < 4) files.push({}) // pad to the required 4 slots
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'multiview_to_model',
      files,
      texture: true,
      pbr: true,
      texture_quality: 'standard',
    }),
  })
  return data.task_id
}

/**
 * Retexture an EXISTING model without changing its geometry (P2 — surface edits:
 * recolor / new material by prompt). Uploads the model bytes, then creates a
 * `texture_model` task with the prompt. The mesh is untouched, only the texture
 * changes — so nothing drifts. Mock-safe (no key → mock model, free).
 *
 * NOTE: mapped from the public docs; not yet exercised against the live API —
 * field names (task type, model token) may need a tweak once a key is set.
 */
export async function createTripoRetextureTask({ bytes, mime = 'model/gltf-binary', prompt }) {
  if (isTripoMock()) return createMockTask('retexture')
  enforceDailyLimit()
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), 'model.glb')
  const uploaded = await tripoFetch('/upload', { method: 'POST', body: form })
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'texture_model',
      original_model: { type: 'glb', file_token: uploaded.image_token },
      text_prompt: prompt || '',
    }),
  })
  return data.task_id
}

/**
 * Retexture via the NATIVE chain: recolor a model that ALREADY lives in Tripo by
 * its generation task_id — no /upload, so it works regardless of GLB size (big
 * models 413 on upload). Mirrors createTripoSegmentByTaskId. `texture_model`
 * takes `original_model_task_id`; geometry is untouched, only the texture changes.
 */
export async function createTripoRetextureByTaskId(originalModelTaskId, prompt) {
  if (isTripoMock()) return createMockTask('retexture')
  enforceDailyLimit()
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'texture_model',
      original_model_task_id: originalModelTaskId,
      text_prompt: prompt || '',
    }),
  })
  return data.task_id
}

/**
 * P3 — real semantic segmentation: split a model into named parts with ids.
 * Uploads the model, creates a `segmentation` task; polling returns the segmented
 * output (per-part meshes / part_names). Mock-safe (no key → mock task).
 *
 * NOTE: written from the docs; not yet exercised live. The current
 * routes/regionEdit.js path uses the built-in GEOMETRIC segmentation (node graph /
 * bands), which is key-free and drives the part UI today; wiring this real Tripo
 * result into that shape is the follow-up once a key is set.
 */
export async function createTripoSegmentTask({ bytes, mime = 'model/gltf-binary' }) {
  if (isTripoMock()) return createMockTask('segmentation')
  enforceDailyLimit()
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), 'model.glb')
  const uploaded = await tripoFetch('/upload', { method: 'POST', body: form })
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'segmentation',
      original_model: { type: 'glb', file_token: uploaded.image_token },
    }),
  })
  return data.task_id
}

/**
 * P3 real (native chain): segment a model that ALREADY lives in Tripo, by its
 * generation task_id — no upload/import/STS. Cheapest path (~40 credits).
 * `mesh_segmentation` takes `original_model_task_id`; polling returns
 * `output.model` = a GLB with one node/mesh per part (tripo_part_N).
 */
export async function createTripoSegmentByTaskId(originalModelTaskId) {
  if (isTripoMock()) return createMockTask('segmentation')
  enforceDailyLimit()
  const data = await tripoFetch('/task', {
    method: 'POST',
    body: JSON.stringify({
      type: 'mesh_segmentation',
      original_model_task_id: originalModelTaskId,
    }),
  })
  return data.task_id
}

// Tripo → our unified (Meshy-shaped) task object, so the existing polling
// route and History flow work unchanged regardless of engine.
const STATUS_MAP = {
  queued: 'PENDING',
  running: 'IN_PROGRESS',
  success: 'SUCCEEDED',
  failed: 'FAILED',
  cancelled: 'CANCELED',
  banned: 'FAILED',
}

/**
 * Fetch the RAW Tripo task data (status + full `output`), or null when unknown.
 * Segmentation output fields aren't the same as generation (pbr_model/model), so
 * the segmentation flow needs the untranslated object to find its result URL.
 */
export async function getTripoTaskRaw(id) {
  if (isTripoMock()) return getMockTask(id)
  try {
    return await tripoFetch(`/task/${encodeURIComponent(id)}`)
  } catch (err) {
    if (err.status === 404 || err.status === 400) return null
    throw err
  }
}

/** Map a raw Tripo status string to our unified status. */
export const tripoStatus = (s) => STATUS_MAP[s] ?? 'IN_PROGRESS'

/** Fetch a Tripo task in the unified shape, or null when unknown. */
export async function getTripoTask(id) {
  if (isTripoMock()) return getMockTask(id)
  let data
  try {
    data = await tripoFetch(`/task/${encodeURIComponent(id)}`)
  } catch (err) {
    if (err.status === 404 || err.status === 400) return null
    throw err
  }
  const status = STATUS_MAP[data.status] ?? 'IN_PROGRESS'
  const glb = data.output?.pbr_model || data.output?.model || data.output?.base_model || null
  return {
    id,
    status,
    progress: status === 'SUCCEEDED' ? 100 : (data.progress ?? 0),
    model_urls: glb ? { glb } : {},
  }
}
