// Generates a set of small, DISTINCT sample .glb models into
// client/public/models so the demo gallery shows variety instead of one mesh.
//
// 100% own/generated geometry (three.js primitives) — no third-party assets.
// Run:  node client/scripts/gen-sample-models.mjs
//
// The community seed (server/src/services/seed.js) maps posts to these files by
// name, so keep the filenames here in sync with that seed.

import * as THREE from 'three'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, '../public/models')
mkdirSync(OUT, { recursive: true })

// ---- one part = a primitive baked with a transform + a base colour ----
function part(geo, { t = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], color }) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...t),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
    new THREE.Vector3(...s),
  )
  geo.applyMatrix4(m)
  if (!geo.attributes.normal) geo.computeVertexNormals()
  const position = Float32Array.from(geo.attributes.position.array)
  const normal = Float32Array.from(geo.attributes.normal.array)
  const index = geo.index
    ? Uint32Array.from(geo.index.array)
    : Uint32Array.from({ length: position.length / 3 }, (_, i) => i)
  return { position, normal, index, color }
}

// ---- minimal GLB (glTF 2.0 binary) writer for a list of coloured parts ----
function buildGLB(parts) {
  const chunks = []
  let offset = 0
  const bufferViews = []
  const accessors = []
  const materials = []
  const primitives = []
  const pad4 = (n) => (n + 3) & ~3

  const addView = (typed, target) => {
    const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength)
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target })
    chunks.push(buf)
    offset += buf.length
    const padded = pad4(offset)
    if (padded > offset) {
      chunks.push(Buffer.alloc(padded - offset))
      offset = padded
    }
    return bufferViews.length - 1
  }

  for (const p of parts) {
    const posView = addView(p.position, 34962)
    const nrmView = addView(p.normal, 34962)
    const idxView = addView(p.index, 34963)
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let k = 0; k < p.position.length; k += 3) {
      for (let c = 0; c < 3; c++) {
        const v = p.position[k + c]
        if (v < min[c]) min[c] = v
        if (v > max[c]) max[c] = v
      }
    }
    const posAcc = accessors.push({ bufferView: posView, componentType: 5126, count: p.position.length / 3, type: 'VEC3', min, max }) - 1
    const nrmAcc = accessors.push({ bufferView: nrmView, componentType: 5126, count: p.normal.length / 3, type: 'VEC3' }) - 1
    const idxAcc = accessors.push({ bufferView: idxView, componentType: 5125, count: p.index.length, type: 'SCALAR' }) - 1
    const mat = materials.push({ pbrMetallicRoughness: { baseColorFactor: [...p.color, 1], metallicFactor: 0.15, roughnessFactor: 0.65 } }) - 1
    primitives.push({ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: mat })
  }

  const bin = Buffer.concat(chunks)
  const gltf = {
    asset: { version: '2.0', generator: '3D Forge sample generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    materials,
    buffers: [{ byteLength: bin.length }],
  }
  let json = JSON.stringify(gltf)
  while (json.length % 4 !== 0) json += ' '
  const jsonBuf = Buffer.from(json, 'utf8')

  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0) // 'glTF'
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8)
  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(jsonBuf.length, 0)
  jsonHead.writeUInt32LE(0x4e4f534a, 4) // 'JSON'
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(bin.length, 0)
  binHead.writeUInt32LE(0x004e4942, 4) // 'BIN\0'
  return Buffer.concat([header, jsonHead, jsonBuf, binHead, bin])
}

// palette (linear-ish sRGB values 0..1)
const C = {
  cyan: [0.13, 0.83, 0.93],
  magenta: [1.0, 0.18, 0.61],
  violet: [0.66, 0.33, 0.97],
  gold: [1.0, 0.82, 0.24],
  silver: [0.8, 0.84, 0.88],
  steel: [0.53, 0.57, 0.65],
  wood: [0.54, 0.35, 0.17],
  leaf: [0.21, 0.9, 0.64],
  stone: [0.6, 0.63, 0.69],
  dark: [0.08, 0.1, 0.15],
  white: [0.93, 0.94, 0.96],
}
const B = THREE.BoxGeometry
const CY = THREE.CylinderGeometry
const CO = THREE.ConeGeometry
const SP = THREE.SphereGeometry
const TO = THREE.TorusGeometry

// each model: filename -> list of parts
const MODELS = {
  'crystal_gem.glb': [part(new THREE.IcosahedronGeometry(1, 0), { s: [0.9, 1.5, 0.9], color: C.violet })],
  'torus_sculpt.glb': [part(new THREE.TorusKnotGeometry(0.7, 0.24, 120, 16), { color: C.cyan })],
  'mech_turret.glb': [
    part(new CY(1.1, 1.3, 0.5, 20), { t: [0, -0.9, 0], color: C.steel }),
    part(new B(1.3, 1.0, 1.3), { t: [0, -0.1, 0], color: C.steel }),
    part(new CY(0.18, 0.18, 1.6, 12), { t: [0, 0.1, 1.0], r: [Math.PI / 2, 0, 0], color: C.magenta }),
  ],
  'lowpoly_tree.glb': [
    part(new CY(0.16, 0.22, 1.2, 8), { t: [0, -0.9, 0], color: C.wood }),
    part(new CO(0.9, 1.2, 8), { t: [0, -0.1, 0], color: C.leaf }),
    part(new CO(0.72, 1.0, 8), { t: [0, 0.7, 0], color: C.leaf }),
  ],
  'runed_sword.glb': [
    part(new B(0.14, 2.4, 0.05), { t: [0, 0.7, 0], color: C.silver }),
    part(new B(0.8, 0.16, 0.16), { t: [0, -0.55, 0], color: C.gold }),
    part(new CY(0.09, 0.09, 0.7, 10), { t: [0, -1.0, 0], color: C.dark }),
    part(new SP(0.13, 12, 10), { t: [0, -1.4, 0], color: C.gold }),
  ],
  'retro_rocket.glb': [
    part(new CY(0.45, 0.45, 1.7, 16), { t: [0, 0, 0], color: C.white }),
    part(new CO(0.45, 0.8, 16), { t: [0, 1.25, 0], color: C.magenta }),
    part(new B(0.1, 0.5, 0.5), { t: [0.42, -0.85, 0], color: C.cyan }),
    part(new B(0.1, 0.5, 0.5), { t: [-0.42, -0.85, 0], color: C.cyan }),
    part(new B(0.5, 0.5, 0.1), { t: [0, -0.85, 0.42], color: C.cyan }),
  ],
  'cyber_helmet.glb': [
    part(new SP(1, 20, 16), { s: [1, 0.95, 1.1], color: C.dark }),
    part(new B(1.5, 0.28, 0.2), { t: [0, 0.05, 0.92], color: C.cyan }),
  ],
  'reading_chair.glb': [
    part(new B(1.1, 0.16, 1.1), { t: [0, 0, 0], color: C.wood }),
    part(new B(1.1, 1.2, 0.16), { t: [0, 0.6, -0.47], color: C.wood }),
    part(new B(0.14, 0.9, 0.14), { t: [0.45, -0.55, 0.45], color: C.wood }),
    part(new B(0.14, 0.9, 0.14), { t: [-0.45, -0.55, 0.45], color: C.wood }),
    part(new B(0.14, 0.9, 0.14), { t: [0.45, -0.55, -0.45], color: C.wood }),
    part(new B(0.14, 0.9, 0.14), { t: [-0.45, -0.55, -0.45], color: C.wood }),
  ],
  'signet_ring.glb': [
    part(new TO(0.7, 0.16, 16, 32), { r: [Math.PI / 2, 0, 0], color: C.gold }),
    part(new B(0.4, 0.4, 0.28), { t: [0, 0.72, 0], color: C.cyan }),
  ],
  'companion_bot.glb': [
    part(new B(1.2, 1.0, 1.0), { t: [0, 0, 0], color: C.steel }),
    part(new SP(0.16, 12, 10), { t: [0.3, 0.1, 0.52], color: C.cyan }),
    part(new SP(0.16, 12, 10), { t: [-0.3, 0.1, 0.52], color: C.cyan }),
    part(new CY(0.05, 0.05, 0.6, 8), { t: [0, 0.8, 0], color: C.steel }),
    part(new SP(0.12, 10, 8), { t: [0, 1.1, 0], color: C.magenta }),
  ],
  'temple_pyramid.glb': [
    part(new B(1.8, 0.4, 1.8), { t: [0, -0.8, 0], color: C.stone }),
    part(new B(1.3, 0.4, 1.3), { t: [0, -0.4, 0], color: C.stone }),
    part(new B(0.85, 0.4, 0.85), { t: [0, 0, 0], color: C.stone }),
    part(new CO(0.5, 0.7, 4), { t: [0, 0.55, 0], r: [0, Math.PI / 4, 0], color: C.gold }),
  ],
}

let n = 0
for (const [name, parts] of Object.entries(MODELS)) {
  writeFileSync(join(OUT, name), buildGLB(parts))
  n++
  console.log('wrote', name, `(${parts.length} part${parts.length === 1 ? '' : 's'})`)
}
console.log(`\nDone — ${n} sample models in ${OUT}`)
