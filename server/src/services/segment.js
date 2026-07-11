import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { dbReady } from '../db.js'
import { load, flush } from './persistence.js'
import { resolveLocalModel } from './convert.js'
import { readCloudFile, cloudFilesEnabled, saveCloudFile } from './files.js'

// Region editing (B-H): segment a model into named parts, hit-test a spatial
// point to a part, and "part-swap" that region. In mock mode (no BANG!/Tripo
// key) parts are derived from the GLB's own node graph — real and useful for
// models that already have named meshes — and the swap replaces the region with
// a bright primitive so the whole flow demos key-free. A paid segmentation
// provider slots in later behind the same shape.

const here = fileURLToPath(new URL('.', import.meta.url))
const UPLOADS_DIR = join(here, '../../.devdata/uploads')

// --- geometry helpers -------------------------------------------------------

const xform = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// world-space AABB of an accessor's local min/max under a node matrix
const worldBox = (world, min, max) => {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < 8; i++) {
    const c = xform(
      world,
      i & 1 ? max[0] : min[0],
      i & 2 ? max[1] : min[1],
      i & 4 ? max[2] : min[2],
    )
    for (let a = 0; a < 3; a++) {
      if (c[a] < lo[a]) lo[a] = c[a]
      if (c[a] > hi[a]) hi[a] = c[a]
    }
  }
  return { min: lo, max: hi }
}

const center = (box) => box.min.map((v, i) => (v + box.max[i]) / 2)

const unionBox = (boxes) => {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    for (let a = 0; a < 3; a++) {
      if (b.min[a] < lo[a]) lo[a] = b.min[a]
      if (b.max[a] > hi[a]) hi[a] = b.max[a]
    }
  }
  return { min: lo, max: hi }
}

/** Read a model's bytes from local disk or GridFS (/files/...). Null if remote/missing. */
async function readModelBytes(modelUrl) {
  if (typeof modelUrl !== 'string') return null
  if (modelUrl.startsWith('/files/')) {
    const f = await readCloudFile(basename(modelUrl))
    return f ? f.bytes : null
  }
  const local = resolveLocalModel(modelUrl)
  if (!local) return null
  try {
    return readFileSync(local)
  } catch {
    return null
  }
}

/**
 * Derive parts from a GLB's node graph: one part per mesh-bearing node, named
 * from the node/mesh (bbox in world space). `index` is the traversal position,
 * used later to re-locate the node for a swap. Falls back to splitting a single
 * merged mesh into vertical bands so there's always something to click.
 */
function extractParts(doc) {
  const parts = []
  let nodeIndex = 0
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh()
      if (!mesh) return
      const idx = nodeIndex++
      const boxes = []
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        boxes.push(worldBox(node.getWorldMatrix(), pos.getMin([]), pos.getMax([])))
      }
      if (!boxes.length) return
      const box = unionBox(boxes)
      const name = node.getName() || mesh.getName() || `part ${idx + 1}`
      parts.push({ id: `${slug(name) || 'part'}-${idx}`, name, index: idx, bbox: box, center: center(box) })
    })
  }
  if (parts.length >= 2) return parts

  // fallback: one merged mesh → 3 vertical bands (all map to the same node 0)
  if (parts.length === 1) {
    const whole = parts[0].bbox
    const yLo = whole.min[1]
    const yHi = whole.max[1]
    const third = (yHi - yLo) / 3
    const bands = [
      ['upper', yLo + 2 * third, yHi],
      ['middle', yLo + third, yLo + 2 * third],
      ['lower', yLo, yLo + third],
    ]
    return bands.map(([name, lo, hi], i) => {
      const box = { min: [whole.min[0], lo, whole.min[2]], max: [whole.max[0], hi, whole.max[2]] }
      return { id: `${name}-0`, name, index: 0, bbox: box, center: center(box), synthetic: true }
    })
  }
  return parts
}

// --- segmentation cache (dual-store) ---------------------------------------

const memCache = new Map() // modelUrl -> parts[]
{
  const saved = load('segments', null)
  if (saved) for (const [url, parts] of Object.entries(saved.segments || {})) memCache.set(url, parts)
}
const saveCache = () => {
  const segments = {}
  for (const [url, parts] of memCache) segments[url] = parts
  flush('segments', { segments })
}

/**
 * Segment a model into parts, cached per modelUrl. Returns
 * { modelUrl, parts: [{ id, name, index, bbox:{min,max}, center }], cached }.
 * Throws NOT_FOUND if the model can't be read (remote/unknown url in mock).
 */
export async function segmentModel(modelUrl) {
  if (memCache.has(modelUrl)) return { modelUrl, parts: memCache.get(modelUrl), cached: true }
  const bytes = await readModelBytes(modelUrl)
  if (!bytes) {
    throw Object.assign(new Error('model not found or not a local/stored GLB'), { code: 'NOT_FOUND' })
  }
  const doc = await new NodeIO().readBinary(new Uint8Array(bytes))
  const parts = extractParts(doc)
  memCache.set(modelUrl, parts)
  saveCache()
  return { modelUrl, parts, cached: false }
}

// --- B-H2: hit-test a spatial point to a part ------------------------------

const inside = (box, p) =>
  p[0] >= box.min[0] && p[0] <= box.max[0] &&
  p[1] >= box.min[1] && p[1] <= box.max[1] &&
  p[2] >= box.min[2] && p[2] <= box.max[2]

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/**
 * Which part does a spatial point belong to? Prefers the smallest bbox that
 * contains the point (so a nested detail wins over the body); otherwise the
 * part whose center is nearest. Returns the part, or null if there are none.
 */
export function hitTestPart(parts, point) {
  if (!Array.isArray(parts) || !parts.length) return null
  const p = [Number(point?.x), Number(point?.y), Number(point?.z)]
  if (p.some((v) => !Number.isFinite(v))) return null
  const containing = parts.filter((part) => inside(part.bbox, p))
  if (containing.length) {
    const vol = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2])
    return containing.reduce((best, part) => (vol(part.bbox) < vol(best.bbox) ? part : best))
  }
  return parts.reduce((best, part) => (dist2(part.center, p) < dist2(best.center, p) ? part : best))
}

// --- B-H3: part swap (mock = replace the region with a primitive) ----------

// a 24-vertex axis-aligned box (flat normals) spanning min..max
function addBox(doc, buffer, min, max) {
  const [x0, y0, z0] = min
  const [x1, y1, z1] = max
  const faces = [
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
  ]
  const pos = []
  const nrm = []
  const idx = []
  faces.forEach((f, fi) => {
    for (const v of f.v) pos.push(...v)
    for (let k = 0; k < 4; k++) nrm.push(...f.n)
    const b = fi * 4
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  })
  const posAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buffer)
  const nrmAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(nrm)).setBuffer(buffer)
  const idxAcc = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(idx)).setBuffer(buffer)
  const mat = doc
    .createMaterial('region-swap')
    .setBaseColorFactor([0.96, 0.42, 0.13, 1]) // forge amber — visibly the new region
    .setMetallicFactor(0)
    .setRoughnessFactor(0.7)
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', nrmAcc)
    .setIndices(idxAcc)
    .setMaterial(mat)
  return doc.createMesh('region-swap').addPrimitive(prim)
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function storeModelBytes(bytes) {
  const name = `edit-${newId()}.glb`
  if (cloudFilesEnabled()) return saveCloudFile(name, Buffer.from(bytes), 'model/gltf-binary')
  mkdirSync(UPLOADS_DIR, { recursive: true })
  writeFileSync(join(UPLOADS_DIR, name), Buffer.from(bytes))
  return `/uploads/${name}`
}

/**
 * Replace one part's node mesh with a primitive sized to its bbox, returning a
 * new stored model URL. This is the key-free mock stand-in for "regenerate just
 * this region"; a real provider would swap in a generated part instead.
 */
export async function partSwap(modelUrl, part) {
  const bytes = await readModelBytes(modelUrl)
  if (!bytes) throw Object.assign(new Error('model not found'), { code: 'NOT_FOUND' })
  const doc = await new NodeIO().readBinary(new Uint8Array(bytes))
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer()

  // re-locate the target node by the same traversal order segmentModel used
  let nodeIndex = 0
  let target = null
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      if (!node.getMesh()) return
      if (nodeIndex === part.index) target = node
      nodeIndex++
    })
  }
  if (!target) throw Object.assign(new Error('part node not found'), { code: 'NOT_FOUND' })

  target.setMesh(addBox(doc, buffer, part.bbox.min, part.bbox.max))
  const out = await new NodeIO().writeBinary(doc)
  const url = await storeModelBytes(out)
  return { modelUrl: url, swappedPart: { id: part.id, name: part.name } }
}
