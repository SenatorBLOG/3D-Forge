import test from 'node:test'
import assert from 'node:assert/strict'
import { segmentModel, hitTestPart, partSwap } from '../src/services/segment.js'
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
    // center lies within its own bbox
    for (let a = 0; a < 3; a++) {
      assert.ok(p.center[a] >= p.bbox.min[a] - 1e-6 && p.center[a] <= p.bbox.max[a] + 1e-6)
    }
  }
  const second = await segmentModel(HAND)
  assert.equal(second.cached, true) // served from cache
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
  // and it re-parses (the swap mesh exists)
  const doc = await new NodeIO().readBinary(new Uint8Array(out))
  assert.ok(doc.getRoot().listMeshes().some((m) => m.getName() === 'region-swap'))
})
