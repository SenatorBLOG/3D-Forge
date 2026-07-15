import test from 'node:test'
import assert from 'node:assert/strict'
import { segmentModel, hitTestPart, partSwap, extractPart, stitchPart } from '../src/services/segment.js'
import { resolveLocalModel } from '../src/services/convert.js'
import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'

// no keys/DB in tests → parts come from the GLB node graph, swap writes to disk

const HAND = '/models/robotic_hand.glb'

test('segmentModel returns parts with bbox + center, and caches', async () => {
  const first = await segmentModel(HAND)
  assert.equal(first.cached, false)
  assert.ok(first.parts.length >= 1)
  for (const p of first.parts) {
    assert.ok(typeof p.id === 'string' && typeof p.name === 'string')
    assert.equal(Number.isInteger(p.index), true)
    assert.equal(p.bbox.min.length, 3)
    assert.equal(p.center.length, 3)
    // center is in the client's CENTERED space — it lies within hitBox
    for (let a = 0; a < 3; a++) {
      assert.ok(p.center[a] >= p.hitBox.min[a] - 1e-6 && p.center[a] <= p.hitBox.max[a] + 1e-6)
    }
  }
  const second = await segmentModel(HAND)
  assert.equal(second.cached, true) // served from cache
})

test('hit-testing happens in the client viewer space (recentered)', async () => {
  // the turret is deliberately off-center in Y; the viewer recenters it before
  // the user clicks, so hitBoxes must straddle the origin overall
  const { parts } = await segmentModel('/models/mech_turret.glb')
  assert.ok(parts.length >= 2, 'turret segments into multiple parts')
  const lo = Math.min(...parts.map((p) => p.hitBox.min[1]))
  const hi = Math.max(...parts.map((p) => p.hitBox.max[1]))
  assert.ok(lo < 0 && hi > 0, `recentered union must straddle y=0 (got ${lo}..${hi})`)

  // a point AT a part's centered center resolves to that part
  const target = parts[parts.length - 1]
  const picked = hitTestPart(parts, {
    x: target.center[0],
    y: target.center[1],
    z: target.center[2],
  })
  assert.equal(picked.id, target.id)
})

test('segmentModel rejects a non-local / unknown model', async () => {
  await assert.rejects(
    () => segmentModel('https://evil.example/x.glb'),
    (err) => err.code === 'NOT_FOUND',
  )
})

test('hitTestPart picks the containing part, else the nearest center', async () => {
  const { parts } = await segmentModel(HAND)
  assert.equal(hitTestPart([], { x: 0, y: 0, z: 0 }), null)
  assert.equal(hitTestPart(parts, { x: NaN, y: 0, z: 0 }), null)

  const target = parts[0]
  // a point at a part's center must resolve to a part (that part, or a smaller
  // one nested at the same spot)
  const hit = hitTestPart(parts, { x: target.center[0], y: target.center[1], z: target.center[2] })
  assert.ok(hit) // always resolves to some part
  // a far-away point falls back to nearest — still non-null
  const far = hitTestPart(parts, { x: 1e6, y: 1e6, z: 1e6 })
  assert.ok(far)
})

test('partSwap returns a new, valid GLB with the region replaced', async () => {
  const { parts } = await segmentModel(HAND)
  const orig = readFileSync(resolveLocalModel(HAND))
  const { modelUrl, swappedPart } = await partSwap(HAND, parts[0])

  assert.match(modelUrl, /^\/uploads\/edit-.*\.glb$/)
  assert.equal(swappedPart.id, parts[0].id)

  const out = readFileSync(resolveLocalModel(modelUrl))
  assert.equal(out.subarray(0, 4).toString('ascii'), 'glTF') // valid binary GLB
  assert.notEqual(out.length, orig.length) // geometry changed
  // and it re-parses (the swap landed: node-level = a new mesh, primitive-level
  // = a retargeted primitive — both carry the region-swap material/mesh name)
  const doc = await new NodeIO().readBinary(new Uint8Array(out))
  assert.ok(
    doc.getRoot().listMeshes().some((m) => m.getName() === 'region-swap') ||
      doc.getRoot().listMaterials().some((m) => m.getName() === 'region-swap'),
  )
})

test('extractPart writes a standalone GLB of just that part', async () => {
  const { parts } = await segmentModel('/models/runed_sword.glb')
  const target = parts[0]
  const { partUrl, part } = await extractPart('/models/runed_sword.glb', target)

  assert.match(partUrl, /^\/uploads\/edit-.*\.glb$/)
  assert.equal(part.id, target.id)
  const bytes = readFileSync(resolveLocalModel(partUrl))
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF')
  const doc = await new NodeIO().readBinary(new Uint8Array(bytes))
  // exactly one mesh with one primitive — the extracted piece only
  const meshes = doc.getRoot().listMeshes()
  assert.equal(meshes.length, 1)
  assert.equal(meshes[0].listPrimitives().length, 1)
})

test('stitchPart fits a new part model into the original bbox, rest intact', async () => {
  const { parts } = await segmentModel('/models/runed_sword.glb')
  const target = parts[0]
  // use ANOTHER model as the "generated part" (stands in for image-to-3D output)
  const { modelUrl, stitchedPart } = await stitchPart(
    '/models/runed_sword.glb',
    target,
    '/models/robotic_hand.glb',
  )
  assert.match(modelUrl, /^\/uploads\/edit-.*\.glb$/)
  assert.equal(stitchedPart.id, target.id)

  const bytes = readFileSync(resolveLocalModel(modelUrl))
  const doc = await new NodeIO().readBinary(new Uint8Array(bytes))
  // the stitched node exists…
  const stitched = doc.getRoot().listNodes().find((n) => n.getName() === `stitched-${target.id}`)
  assert.ok(stitched, 'stitched node present')
  // …its geometry fills the ORIGINAL part's bbox (per-axis fit, small tolerance)
  const prim = stitched.getMesh().listPrimitives()[0]
  const min = prim.getAttribute('POSITION').getMin([])
  const max = prim.getAttribute('POSITION').getMax([])
  for (let a = 0; a < 3; a++) {
    assert.ok(Math.abs(min[a] - target.bbox.min[a]) < 1e-3, `min[${a}] fits`)
    assert.ok(Math.abs(max[a] - target.bbox.max[a]) < 1e-3, `max[${a}] fits`)
  }
  // and the original mesh kept its OTHER primitives (one was removed, none added)
  const sword = doc.getRoot().listMeshes().find((m) => m !== stitched.getMesh())
  assert.equal(sword.listPrimitives().length, parts.length - 1)
})

test('stitchPart rejects an unreadable part model', async () => {
  const { parts } = await segmentModel(HAND)
  await assert.rejects(
    () => stitchPart(HAND, parts[0], 'https://evil.example/x.glb'),
    (err) => err.code === 'NOT_FOUND',
  )
})

test('a multi-primitive mesh segments per primitive and swaps only that piece', async () => {
  const { parts } = await segmentModel('/models/runed_sword.glb')
  // the sword is one mesh with 4 primitives (blade/guard/grip/pommel)
  assert.ok(parts.length >= 3, `expected primitive-level parts, got ${parts.length}`)
  assert.ok(parts.every((p) => Number.isInteger(p.primIndex)))

  const blade = parts[0]
  const { modelUrl } = await partSwap('/models/runed_sword.glb', blade)
  const out = readFileSync(resolveLocalModel(modelUrl))
  const doc = await new NodeIO().readBinary(new Uint8Array(out))
  // still ONE mesh with the SAME number of primitives — only one was retargeted
  const meshes = doc.getRoot().listMeshes()
  assert.equal(meshes.length, 1)
  assert.equal(meshes[0].listPrimitives().length, parts.length)
  assert.ok(doc.getRoot().listMaterials().some((m) => m.getName() === 'region-swap'))
})
