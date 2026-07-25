import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { dbReady } from '../db.js'
import { listMemory } from './history.js'
import GeneratedModel from '../models/GeneratedModel.js'
import { cloudFilesEnabled, saveCloudFile } from './files.js'
import {
  createTripoPrerigCheckTask,
  createTripoRigTask,
  createTripoAnimateTask,
  getTripoTaskRaw,
  tripoStatus,
  isTripoMock,
} from './tripo.js'

/**
 * Task 6 — rigging & animation service.
 * Chains off a model's native Tripo generation task_id (like segmentation /
 * retexture), so nothing is re-uploaded. Rig once (25 cr), then apply preset
 * animations (10 cr each) that chain off the RIG task. Each animation is one
 * clip; the client keeps the per-model set and only pays for NEW clips.
 * Verified live 2026-07-21 (rig=25, walk=10, GLB has 41-bone skeleton + clip).
 */

const here = fileURLToPath(new URL('.', import.meta.url))
const UPLOADS_DIR = join(here, '../../.devdata/uploads')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Resolve the bare Tripo generation task id behind a stored model URL (same
// lookup regionEdit uses for segmentation). null when the model isn't Tripo-made
// OR was made under a different API key (that model's task isn't in this account).
async function tripoTaskIdForModel(modelUrl) {
  let taskId = listMemory().find((e) => e.modelUrl === modelUrl)?.taskId || null
  if (!taskId && dbReady()) {
    try {
      taskId = (await GeneratedModel.findOne({ modelUrl }).lean())?.meshyTaskId || null
    } catch {
      /* non-fatal */
    }
  }
  return taskId && taskId.startsWith('tripo-') ? taskId.slice('tripo-'.length) : null
}

// rig / retarget output puts the GLB at output.model (string) or result.model.url
function findModelUrl(raw) {
  const out = raw?.output || {}
  if (typeof out.model === 'string') return out.model
  if (out.model?.url) return out.model.url
  if (raw?.result?.model?.url) return raw.result.model.url
  return null
}

async function pollTask(taskId, label) {
  let raw = null
  for (let i = 0; i < 200; i++) {
    raw = await getTripoTaskRaw(taskId)
    const st = tripoStatus(raw?.status)
    if (st === 'SUCCEEDED') return raw
    if (st === 'FAILED' || st === 'CANCELED') {
      throw new Error(`Tripo ${label} ${st}: ${JSON.stringify(raw?.output || raw).slice(0, 200)}`)
    }
    await sleep(2500)
  }
  throw new Error(`Tripo ${label} timed out`)
}

async function storeModelBytes(bytes, prefix) {
  const name = `${prefix}-${newId()}.glb`
  if (cloudFilesEnabled()) return saveCloudFile(name, Buffer.from(bytes), 'model/gltf-binary')
  mkdirSync(UPLOADS_DIR, { recursive: true })
  writeFileSync(join(UPLOADS_DIR, name), Buffer.from(bytes))
  return `/uploads/${name}`
}

async function downloadAndStore(remoteUrl, prefix) {
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error(`failed to download the model (HTTP ${res.status})`)
  const bytes = Buffer.from(await res.arrayBuffer())
  return storeModelBytes(bytes, prefix)
}

const noKey = () =>
  Object.assign(new Error('TRIPO_API_KEY not set on the server'), { code: 'NO_KEY' })
const notTripo = () =>
  Object.assign(
    new Error('Rigging works only on models generated with Tripo (this session key).'),
    { code: 'NOT_TRIPO' },
  )

/**
 * Free riggability check. Returns { riggable, rigType, taskId } where taskId is
 * the bare Tripo id (needed later for rig). Throws NOT_TRIPO when the model has
 * no reachable Tripo task under this key.
 */
// A real Tripo GENERATION task id is a UUID. Our derived models (segmented,
// stitched, part-swapped, recolored) carry SYNTHETIC ids (seg-…, stitch-…) that
// aren't real Tripo tasks — they can't be rigged. Detect them so we give a clear
// message instead of a Tripo "task not found" crash.
const isRealTripoId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const notOriginal = () =>
  Object.assign(
    new Error('This is a segmented/edited version — animate the ORIGINAL Tripo model instead.'),
    { code: 'NOT_TRIPO' },
  )

export async function prerigCheck(modelUrl) {
  if (isTripoMock()) return { riggable: true, rigType: 'biped', mock: true, taskId: null }
  const tripoId = await tripoTaskIdForModel(modelUrl)
  if (!tripoId) throw notTripo()
  if (!isRealTripoId(tripoId)) {
    return {
      riggable: false,
      reason: 'This is a segmented/edited version — animate the original Tripo model instead.',
      taskId: null,
      mock: false,
    }
  }
  try {
    const checkId = await createTripoPrerigCheckTask(tripoId)
    const raw = await pollTask(checkId, 'prerigcheck')
    return {
      riggable: !!raw?.output?.riggable,
      rigType: raw?.output?.rig_type || raw?.output?.topology || null,
      taskId: tripoId,
      mock: false,
    }
  } catch (err) {
    // Tripo couldn't find/riggability-check this task (e.g. made with a different
    // API key, or not a real generation) → report cleanly, don't 500.
    return {
      riggable: false,
      reason: 'Tripo could not check this model (it may be an edited version or made with another key).',
      taskId: null,
      mock: false,
    }
  }
}

/**
 * Put a skeleton on the model (25 cr). Returns { modelUrl, rigTaskId, mock }.
 * rigTaskId is what animations chain off (stored per-model on the client so the
 * 25 cr is paid only once — later animations skip straight to retarget).
 */
export async function rigModel(modelUrl) {
  if (isTripoMock()) return { modelUrl, rigTaskId: `mock-rig-${newId()}`, mock: true }
  const tripoId = await tripoTaskIdForModel(modelUrl)
  if (!tripoId) throw notTripo()
  if (!isRealTripoId(tripoId)) throw notOriginal()
  const rigTaskId = await createTripoRigTask(tripoId)
  const raw = await pollTask(rigTaskId, 'rig')
  const remoteUrl = findModelUrl(raw)
  if (!remoteUrl) throw noKey()
  const storedUrl = await downloadAndStore(remoteUrl, 'model-tripo-rig')
  return { modelUrl: storedUrl, rigTaskId, consumedCredit: raw?.consumed_credit ?? 25, mock: false }
}

/**
 * Apply ONE preset animation to an already-rigged model (10 cr). `preset` is a
 * bare name ('walk') or full 'preset:walk'. Returns { modelUrl, animTaskId,
 * preset, consumedCredit } — a GLB with the skeleton + that single clip.
 */
export async function applyAnimation(rigTaskId, preset) {
  const full = preset.startsWith('preset:') ? preset : `preset:${preset}`
  if (isTripoMock()) return { modelUrl: null, animTaskId: `mock-anim-${newId()}`, preset: full, mock: true }
  if (!rigTaskId || rigTaskId.startsWith('mock-')) throw noKey()
  const animTaskId = await createTripoAnimateTask(rigTaskId, full)
  const raw = await pollTask(animTaskId, 'retarget')
  const remoteUrl = findModelUrl(raw)
  if (!remoteUrl) throw noKey()
  const storedUrl = await downloadAndStore(remoteUrl, 'model-tripo-anim')
  return {
    modelUrl: storedUrl,
    animTaskId,
    preset: full,
    consumedCredit: raw?.consumed_credit ?? 10,
    mock: false,
  }
}
