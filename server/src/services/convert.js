import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'

// GLB → OBJ / STL conversion for the download menu. Pure file transformation —
// no keys, no DB, identical in mock and real mode. Built on @gltf-transform/core
// (Node-first, no DOM shims) instead of three's GLTFLoader, which expects
// browser Image/ImageBitmap APIs when a GLB carries textures.

// Where local models live. MODELS_DIR mirrors services/seed.js; UPLOADS_DIR
// mirrors UPLOAD_DIR in routes/models.js (kept separate to avoid a route→service
// import cycle).
const here = fileURLToPath(new URL('.', import.meta.url))
const MODELS_DIR = join(here, '../../../client/public/models')
const UPLOADS_DIR = join(here, '../../.devdata/uploads')

// SSRF/path-traversal guard: only a single-component local .glb path under
// /models or /uploads is accepted — no remote URLs, no slashes inside the name,
// so `..` segments are impossible. Returns the absolute file path, or null.
const LOCAL_SRC = /^\/(models|uploads)\/([A-Za-z0-9][A-Za-z0-9._-]*\.glb)$/
export function resolveLocalModel(src) {
  const m = typeof src === 'string' ? src.match(LOCAL_SRC) : null
  if (!m) return null
  return join(m[1] === 'models' ? MODELS_DIR : UPLOADS_DIR, m[2])
}

export const localModelExists = (path) => !!path && existsSync(path)

// --- geometry extraction ---------------------------------------------------

const TRIANGLES = 4 // glTF primitive.mode for indexed/soup triangles

// column-major mat4 * point
const xform = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

/**
 * Parse a binary GLB and flatten every triangle primitive into world space.
 * Returns [{ positions: number[] (xyz triples), indices: number[] }].
 */
async function extractMeshes(glbBytes) {
  const doc = await new NodeIO().readBinary(new Uint8Array(glbBytes))
  const out = []
  for (const scene of doc.getRoot().listScenes()) {
    scene.traverse((node) => {
      const mesh = node.getMesh()
      if (!mesh) return
      const world = node.getWorldMatrix()
      for (const prim of mesh.listPrimitives()) {
        if (prim.getMode() !== TRIANGLES) continue // lines/points don't export
        const pos = prim.getAttribute('POSITION')
        if (!pos) continue
        const raw = pos.getArray()
        const positions = new Array(raw.length)
        for (let i = 0; i < raw.length; i += 3) {
          const [x, y, z] = xform(world, raw[i], raw[i + 1], raw[i + 2])
          positions[i] = x
          positions[i + 1] = y
          positions[i + 2] = z
        }
        const idx = prim.getIndices()
        const indices = idx
          ? Array.from(idx.getArray())
          : Array.from({ length: raw.length / 3 }, (_, i) => i)
        out.push({ positions, indices })
      }
    })
  }
  return out
}

const num = (v) => (Object.is(v, -0) ? '0' : String(Number(v.toFixed(6))))

// --- exporters ---------------------------------------------------------------

/** Convert GLB bytes to Wavefront OBJ text (positions + faces, world space). */
export async function glbToObj(glbBytes) {
  const meshes = await extractMeshes(glbBytes)
  const lines = ['# exported by 3D Forge']
  let offset = 1 // OBJ face indices are global and 1-based
  for (let m = 0; m < meshes.length; m++) {
    const { positions, indices } = meshes[m]
    lines.push(`o mesh_${m}`)
    for (let i = 0; i < positions.length; i += 3) {
      lines.push(`v ${num(positions[i])} ${num(positions[i + 1])} ${num(positions[i + 2])}`)
    }
    for (let i = 0; i + 2 < indices.length; i += 3) {
      lines.push(`f ${indices[i] + offset} ${indices[i + 1] + offset} ${indices[i + 2] + offset}`)
    }
    offset += positions.length / 3
  }
  return lines.join('\n') + '\n'
}

/** Convert GLB bytes to ASCII STL text (per-facet normals computed). */
export async function glbToStl(glbBytes) {
  const meshes = await extractMeshes(glbBytes)
  const lines = ['solid model']
  for (const { positions, indices } of meshes) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 3, indices[i + 1] * 3, indices[i + 2] * 3]
      const ax = positions[a], ay = positions[a + 1], az = positions[a + 2]
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2]
      const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2]
      // facet normal = normalize((B-A) × (C-A)); degenerate triangles get 0 0 0
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      let nx = uy * vz - uz * vy
      let ny = uz * vx - ux * vz
      let nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len > 0) {
        nx /= len
        ny /= len
        nz /= len
      }
      lines.push(
        `  facet normal ${num(nx)} ${num(ny)} ${num(nz)}`,
        '    outer loop',
        `      vertex ${num(ax)} ${num(ay)} ${num(az)}`,
        `      vertex ${num(bx)} ${num(by)} ${num(bz)}`,
        `      vertex ${num(cx)} ${num(cy)} ${num(cz)}`,
        '    endloop',
        '  endfacet',
      )
    }
  }
  lines.push('endsolid model')
  return lines.join('\n') + '\n'
}
