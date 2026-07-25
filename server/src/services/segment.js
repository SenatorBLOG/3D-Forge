import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, basename } from 'node:path'
import { Document, NodeIO } from '@gltf-transform/core'
import { dbReady } from '../db.js'
import { load, flush } from './persistence.js'
import { resolveLocalModel } from './convert.js'
import { readCloudFile, cloudFilesEnabled, saveCloudFile } from './files.js'
import { createTripoSegmentByTaskId, getTripoTaskRaw, tripoStatus, isTripoMock } from './tripo.js'

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

// The client viewer recenters the model on its overall bbox center before the
// user clicks, so raycast points arrive in CENTERED space while our bboxes are
// world-space. Give every part a `hitBox`/`center` shifted by the overall
// center for hit-testing, keeping `bbox` untouched (the swap needs raw coords).
const recenterForHitTest = (parts) => {
  if (!parts.length) return parts
  const overall = unionBox(parts.map((p) => p.bbox))
  const C = center(overall)
  for (const p of parts) {
    p.hitBox = {
      min: p.bbox.min.map((v, i) => v - C[i]),
      max: p.bbox.max.map((v, i) => v - C[i]),
    }
    p.center = center(p.hitBox)
  }
  return parts
}

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
export async function readModelBytes(modelUrl) {
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
      const world = node.getWorldMatrix()
      const prims = mesh.listPrimitives().filter((p) => p.getAttribute('POSITION'))
      if (!prims.length) return
      const name = node.getName() || mesh.getName() || `part ${idx + 1}`
      if (prims.length > 1) {
        // generated GLBs are often ONE mesh with a primitive per logical part
        // (our sample models are) — segment at primitive level so a swap
        // touches just that piece
        prims.forEach((prim, k) => {
          const pos = prim.getAttribute('POSITION')
          const box = worldBox(world, pos.getMin([]), pos.getMax([]))
          const pname = prim.getMaterial()?.getName() || `piece ${k + 1}`
          parts.push({
            id: `${slug(pname) || 'part'}-${idx}-${k}`,
            name: pname,
            index: idx,
            primIndex: k,
            bbox: box,
            center: center(box),
          })
        })
        return
      }
      const pos = prims[0].getAttribute('POSITION')
      const box = worldBox(world, pos.getMin([]), pos.getMax([]))
      parts.push({ id: `${slug(name) || 'part'}-${idx}`, name, index: idx, bbox: box, center: center(box) })
    })
  }
  if (parts.length >= 2) return recenterForHitTest(parts)

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
    return recenterForHitTest(
      bands.map(([name, lo, hi]) => {
        const box = { min: [whole.min[0], lo, whole.min[2]], max: [whole.max[0], hi, whole.max[2]] }
        return { id: `${name}-0`, name, index: 0, bbox: box, center: center(box), synthetic: true }
      }),
    )
  }
  return recenterForHitTest(parts)
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

// --- P3 real: Tripo semantic segmentation ----------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Pull the first plausible model URL out of a Tripo segmentation `output`. The
// exact field name is doc-based/untested — try the likely keys, then any http
// value — and the raw output is logged on the first real call so we can pin it.
function findSegmentedModelUrl(output) {
  if (!output || typeof output !== 'object') return null
  const keys = ['segmented_model', 'model', 'pbr_model', 'base_model', 'glb', 'result']
  for (const k of keys) {
    const v = output[k]
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
    if (v && typeof v === 'object' && typeof v.url === 'string') return v.url
  }
  for (const v of Object.values(output)) {
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return v
  }
  return null
}

/**
 * REAL segmentation via Tripo (native chain, spends ~40 credits). Segments a
 * model that ALREADY lives in Tripo by its generation task_id — no upload/import
 * (verified 2026-07-18: `mesh_segmentation` → `output.model` = GLB with one
 * node/mesh per part, `tripo_part_N`). Downloads that GLB, stores it, and derives
 * parts with the SAME extractParts we already use — so real parts + a working
 * explode come for free. Returns the stored segmented model URL + parts.
 * `originalModelUrl` (optional) is cached to resolve to the same parts.
 * Throws NO_KEY when TRIPO_API_KEY isn't set.
 */
export async function segmentTripoByTaskId(tripoTaskId, originalModelUrl = null) {
  if (isTripoMock()) throw Object.assign(new Error('TRIPO_API_KEY not set on the server'), { code: 'NO_KEY' })

  const taskId = await createTripoSegmentByTaskId(tripoTaskId)
  let raw = null
  for (let i = 0; i < 200; i++) {
    raw = await getTripoTaskRaw(taskId)
    const st = tripoStatus(raw?.status)
    if (st === 'SUCCEEDED') break
    if (st === 'FAILED' || st === 'CANCELED') {
      throw new Error(`Tripo segmentation ${st}: ${JSON.stringify(raw?.output || raw).slice(0, 200)}`)
    }
    await sleep(2500)
  }
  console.log('[tripo segmentation] task', taskId, 'output:', JSON.stringify(raw?.output))

  const remoteUrl = findSegmentedModelUrl(raw?.output)
  if (!remoteUrl) {
    throw Object.assign(
      new Error(`no segmented model URL in Tripo output: ${JSON.stringify(raw?.output).slice(0, 300)}`),
      { code: 'BAD_OUTPUT' },
    )
  }
  const segRes = await fetch(remoteUrl)
  if (!segRes.ok) throw new Error(`failed to download the segmented model (HTTP ${segRes.status})`)
  const segBytes = Buffer.from(await segRes.arrayBuffer())
  // name it with "tripo" so the viewer's Tripo-facing camera flip applies here too
  const storedUrl = await storeModelBytes(segBytes, 'model-tripo-seg')
  const doc = await new NodeIO().readBinary(new Uint8Array(segBytes))
  const parts = extractParts(doc)
  memCache.set(storedUrl, parts)
  if (originalModelUrl) memCache.set(originalModelUrl, parts)
  saveCache()
  return { modelUrl: storedUrl, parts, cached: false, engine: 'tripo', taskId }
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
  // hitBox/center are in the client's centered space; old cache entries may
  // predate hitBox, so fall back to the raw bbox for them
  const boxOf = (part) => part.hitBox || part.bbox
  const containing = parts.filter((part) => inside(boxOf(part), p))
  if (containing.length) {
    const vol = (b) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2])
    return containing.reduce((best, part) => (vol(boxOf(part)) < vol(boxOf(best)) ? part : best))
  }
  return parts.reduce((best, part) => (dist2(part.center, p) < dist2(best.center, p) ? part : best))
}

// --- B-H3: part swap (mock = replace the region with a primitive) ----------

// a 24-vertex axis-aligned box (flat normals) spanning min..max — returns the
// accessors + swap material so callers can build a mesh OR retarget a primitive
function boxAccessors(doc, buffer, min, max) {
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
    .setBaseColorFactor([0.13, 0.83, 0.93, 1]) // electric cyan — visibly the new region
    .setMetallicFactor(0.2)
    .setRoughnessFactor(0.5)
  return { posAcc, nrmAcc, idxAcc, mat }
}

// node-level replacement: the whole node's mesh becomes the swap box
function boxMesh(doc, buffer, min, max) {
  const { posAcc, nrmAcc, idxAcc, mat } = boxAccessors(doc, buffer, min, max)
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', nrmAcc)
    .setIndices(idxAcc)
    .setMaterial(mat)
  return doc.createMesh('region-swap').addPrimitive(prim)
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function storeModelBytes(bytes, prefix = 'edit') {
  const name = `${prefix}-${newId()}.glb`
  if (cloudFilesEnabled()) return saveCloudFile(name, Buffer.from(bytes), 'model/gltf-binary')
  mkdirSync(UPLOADS_DIR, { recursive: true })
  writeFileSync(join(UPLOADS_DIR, name), Buffer.from(bytes))
  return `/uploads/${name}`
}

// --- P4: part extraction + stitch (segment → photo → regen → stitch) --------

/**
 * Collect a doc's mesh primitives as world-space triangle soup. When `onlyIndex`
 * is given, only the node at that traversal index (same order segmentModel used)
 * is taken. Normals are copied as-is (generated GLBs are near-identity), indices
 * as-is, and the material reduces to its baseColorFactor — textures are dropped,
 * an accepted tradeoff of the experimental stitch path.
 */
function collectWorldPrimitives(doc, onlyIndex = null, onlyPrim = null) {
  const prims = []
  let nodeIndex = 0
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh()
      if (!mesh) return
      const idx = nodeIndex++
      if (onlyIndex != null && idx !== onlyIndex) return
      const world = node.getWorldMatrix()
      // primIndex counts over POSITION-bearing primitives (same as extractParts)
      let primIndex = -1
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        primIndex++
        if (onlyPrim != null && primIndex !== onlyPrim) continue
        const src = pos.getArray()
        const positions = new Float32Array(src.length)
        for (let i = 0; i < src.length; i += 3) {
          const p = xform(world, src[i], src[i + 1], src[i + 2])
          positions[i] = p[0]
          positions[i + 1] = p[1]
          positions[i + 2] = p[2]
        }
        const nrm = prim.getAttribute('NORMAL')
        const idxAcc = prim.getIndices()
        prims.push({
          positions,
          normals: nrm ? new Float32Array(nrm.getArray()) : null,
          indices: idxAcc ? idxAcc.getArray().slice() : null,
          color: prim.getMaterial()?.getBaseColorFactor() || [0.62, 0.65, 0.7, 1],
        })
      }
    })
  }
  return prims
}

/** Append triangle-soup primitives to `mesh`, optionally remapping each point. */
function addPrimsToMesh(doc, buffer, mesh, prims, mapPoint = null) {
  for (const p of prims) {
    let positions = p.positions
    if (mapPoint) {
      positions = new Float32Array(p.positions.length)
      for (let i = 0; i < p.positions.length; i += 3) {
        const m = mapPoint([p.positions[i], p.positions[i + 1], p.positions[i + 2]])
        positions[i] = m[0]
        positions[i + 1] = m[1]
        positions[i + 2] = m[2]
      }
    }
    const posAcc = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer)
    const prim = doc.createPrimitive().setAttribute('POSITION', posAcc)
    if (p.normals) {
      prim.setAttribute(
        'NORMAL',
        doc.createAccessor().setType('VEC3').setArray(p.normals).setBuffer(buffer),
      )
    }
    if (p.indices) {
      prim.setIndices(
        doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(p.indices)).setBuffer(buffer),
      )
    }
    const mat = doc
      .createMaterial('part-mat')
      .setBaseColorFactor(p.color)
      .setMetallicFactor(0)
      .setRoughnessFactor(0.7)
    prim.setMaterial(mat)
    mesh.addPrimitive(prim)
  }
}

const primsBBox = (prims) => {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const p of prims) {
    for (let i = 0; i < p.positions.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        const v = p.positions[i + a]
        if (v < lo[a]) lo[a] = v
        if (v > hi[a]) hi[a] = v
      }
    }
  }
  return { min: lo, max: hi }
}

/**
 * Extract ONE part into its own stored GLB (world-space, textures reduced to
 * base color). The client renders it to a photo for the edit loop. Synthetic
 * band parts share node 0, so a band extracts the whole mesh — documented
 * limitation of the geometric fallback.
 */
export async function extractPart(modelUrl, part) {
  return extractRegion(modelUrl, [part], part.id, part.name)
}

/**
 * Extract a REGION (one or several parts — e.g. a whole arm grouped from 3-4
 * segments) into its own stored GLB, so it can be photographed / rebuilt as ONE.
 * Combines the world-space primitives of every listed part.
 */
export async function extractRegion(modelUrl, partList, id = 'region', name = 'region') {
  const bytes = await readModelBytes(modelUrl)
  if (!bytes) throw Object.assign(new Error('model not found'), { code: 'NOT_FOUND' })
  const srcDoc = await new NodeIO().readBinary(new Uint8Array(bytes))
  const prims = []
  for (const part of partList) {
    prims.push(
      ...collectWorldPrimitives(
        srcDoc,
        part.index,
        Number.isInteger(part.primIndex) ? part.primIndex : null,
      ),
    )
  }
  if (!prims.length) throw Object.assign(new Error('region has no geometry'), { code: 'NOT_FOUND' })

  const doc = new Document()
  const buffer = doc.createBuffer()
  const mesh = doc.createMesh('part')
  const node = doc.createNode(name || 'part').setMesh(mesh)
  doc.createScene().addChild(node)
  addPrimsToMesh(doc, buffer, mesh, prims)

  const out = await new NodeIO().writeBinary(doc)
  const url = await storeModelBytes(out)
  return { partUrl: url, part: { id, name } }
}

/**
 * Stitch a newly generated part model into the original: the new part's geometry
 * is scaled/translated to fill the ORIGINAL part's bbox (per-axis fit), the old
 * part node's mesh is detached, and the fitted geometry joins the scene — the
 * rest of the model stays byte-identical. No CSG weld (experimental): seams can
 * show; that's the accepted tradeoff versus regenerating everything.
 */
export async function stitchPart(modelUrl, part, partModelUrl) {
  return stitchRegion(modelUrl, [part], partModelUrl, part.bbox, part.id, part.name)
}

/**
 * Stitch a rebuilt REGION (one or several parts) back into the original at the
 * region's union bbox: uniform-scale + centre the new geometry, detach every
 * original part in the region, and add the fitted geometry. The rest of the model
 * stays byte-identical. Experimental (no CSG weld, orientation from the rebuild).
 */
export async function stitchRegion(modelUrl, partList, partModelUrl, targetBbox, id = 'region', name = 'region') {
  const baseBytes = await readModelBytes(modelUrl)
  if (!baseBytes) throw Object.assign(new Error('model not found'), { code: 'NOT_FOUND' })
  const newBytes = await readModelBytes(partModelUrl)
  if (!newBytes) throw Object.assign(new Error('part model not found'), { code: 'NOT_FOUND' })

  const io = new NodeIO()
  const doc = await io.readBinary(new Uint8Array(baseBytes))
  const partDoc = await io.readBinary(new Uint8Array(newBytes))
  const newPrims = collectWorldPrimitives(partDoc)
  if (!newPrims.length) throw Object.assign(new Error('part model has no geometry'), { code: 'NOT_FOUND' })
  const part = { bbox: targetBbox } // region fits the union bbox of all its parts

  // Fit the new geometry into the original part's bbox with a UNIFORM scale +
  // centre alignment — NOT a per-axis stretch. Per-axis fitting warped/disfigured
  // the rebuilt part whenever its proportions differed from the bbox (and made a
  // rotated rebuild worse). Uniform scale keeps the rebuilt part's own shape; we
  // match overall SIZE by the bbox diagonal (rotation-invariant) and drop it in at
  // the original centre. Orientation still comes from the rebuild itself (feed it
  // clean axis-aligned views); a corrective rotation is the next refinement.
  const src = primsBBox(newPrims)
  const t = part.bbox
  const eps = 1e-9
  const size = (b) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  const diag = (s) => Math.max(Math.hypot(s[0], s[1], s[2]), eps)
  const uni = diag(size(t)) / diag(size(src))
  const srcC = [0, 1, 2].map((a) => (src.min[a] + src.max[a]) / 2)
  const tC = [0, 1, 2].map((a) => (t.min[a] + t.max[a]) / 2)
  const mapPoint = (p) => [0, 1, 2].map((a) => tC[a] + (p[a] - srcC[a]) * uni)

  // detach EVERY original part in the region (same traversal order segmentModel
  // used): whole node mesh for node-level parts, one primitive for primitive-level
  // ones. Collect prim references FIRST, then remove — so removing an earlier
  // primitive can't reindex a later one in the same mesh.
  const nodes = []
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      if (node.getMesh()) nodes.push(node)
    })
  }
  const toRemove = []
  for (const p of partList) {
    const target = nodes[p.index]
    if (!target || !target.getMesh()) continue
    if (Number.isInteger(p.primIndex)) {
      const withPos = target.getMesh().listPrimitives().filter((pr) => pr.getAttribute('POSITION'))
      const prim = withPos[p.primIndex]
      if (prim) toRemove.push({ node: target, prim })
    } else {
      toRemove.push({ node: target, whole: true })
    }
  }
  if (!toRemove.length) throw Object.assign(new Error('region nodes not found'), { code: 'NOT_FOUND' })
  for (const r of toRemove) {
    if (r.whole) r.node.setMesh(null)
    else r.node.getMesh()?.removePrimitive(r.prim)
  }

  // the fitted new region joins at the scene root (identity transform, world coords)
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer()
  const mesh = doc.createMesh('stitched-part')
  addPrimsToMesh(doc, buffer, mesh, newPrims, mapPoint)
  const scene0 = doc.getRoot().listScenes()[0]
  scene0.addChild(doc.createNode(`stitched-${id}`).setMesh(mesh))

  const out = await io.writeBinary(doc)
  const url = await storeModelBytes(out)
  return { modelUrl: url, stitchedPart: { id, name } }
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

  if (Number.isInteger(part.primIndex)) {
    // primitive-level swap: replace just this primitive's geometry + material,
    // in the node's LOCAL space (so any node transform still applies)
    const prim = target.getMesh().listPrimitives()[part.primIndex]
    if (!prim || !prim.getAttribute('POSITION')) {
      throw Object.assign(new Error('part primitive not found'), { code: 'NOT_FOUND' })
    }
    const pos = prim.getAttribute('POSITION')
    const { posAcc, nrmAcc, idxAcc, mat } = boxAccessors(doc, buffer, pos.getMin([]), pos.getMax([]))
    prim
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', nrmAcc)
      .setIndices(idxAcc)
      .setMaterial(mat)
  } else {
    target.setMesh(boxMesh(doc, buffer, part.bbox.min, part.bbox.max))
  }
  const out = await new NodeIO().writeBinary(doc)
  const url = await storeModelBytes(out)
  return { modelUrl: url, swappedPart: { id: part.id, name: part.name } }
}
