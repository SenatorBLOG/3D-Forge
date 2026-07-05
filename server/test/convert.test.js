import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveLocalModel,
  localModelExists,
  glbToObj,
  glbToStl,
} from '../src/services/convert.js'

// conversion is pure file transformation — no keys/DB involved

const HAND = '/models/robotic_hand.glb'

const handBytes = () => readFileSync(resolveLocalModel(HAND))

test('resolveLocalModel accepts only single-component local .glb paths', () => {
  assert.ok(resolveLocalModel(HAND)?.endsWith('robotic_hand.glb'))
  assert.ok(resolveLocalModel('/uploads/123-abc.glb'))
  // SSRF / traversal / junk → null
  assert.equal(resolveLocalModel('http://evil/x.glb'), null)
  assert.equal(resolveLocalModel('https://assets.meshy.ai/m.glb'), null)
  assert.equal(resolveLocalModel('/models/../secrets.glb'), null)
  assert.equal(resolveLocalModel('/models/sub/dir.glb'), null)
  assert.equal(resolveLocalModel('/models/hand.gltf'), null)
  assert.equal(resolveLocalModel(''), null)
  assert.equal(resolveLocalModel(42), null)
})

test('the bundled demo model resolves and exists on disk', () => {
  assert.equal(localModelExists(resolveLocalModel(HAND)), true)
  assert.equal(localModelExists(resolveLocalModel('/models/nope.glb')), false)
})

test('glbToObj produces vertices and faces', async () => {
  const obj = await glbToObj(handBytes())
  assert.ok(obj.includes('\nv '), 'has v lines')
  assert.ok(obj.includes('\nf '), 'has f lines')
  // faces are 1-based: no face may reference index 0
  assert.ok(!/\nf [^\n]*(?:^|\s)0(?:\s|$)/.test(obj))
})

test('glbToStl produces an ASCII solid with facets', async () => {
  const stl = await glbToStl(handBytes())
  assert.ok(stl.startsWith('solid'), 'starts with solid')
  assert.ok(stl.includes('facet normal'), 'has facets')
  assert.ok(stl.includes('vertex'), 'has vertices')
  assert.ok(stl.trimEnd().endsWith('endsolid model'))
})

test('glb passthrough source bytes are untouched by resolution', () => {
  // mirrors the route's format=glb branch: it streams exactly what's on disk
  const bytes = handBytes()
  assert.ok(bytes.length > 0)
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'glTF')
})
