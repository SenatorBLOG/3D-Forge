import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTier } from '../src/routes/generate.js'

test('resolveTier maps tier names, shorthands and the legacy model alias', () => {
  assert.equal(resolveTier({ tier: 'meshy-6' }), 'meshy-6')
  assert.equal(resolveTier({ tier: 'm6' }), 'meshy-6')
  assert.equal(resolveTier({ tier: 'meshy-5' }), 'meshy-5')
  assert.equal(resolveTier({ tier: 'm5' }), 'meshy-5')
  assert.equal(resolveTier({ model: 'meshy-6' }), 'meshy-6') // legacy alias
  // tier wins over the legacy alias when both are present
  assert.equal(resolveTier({ tier: 'm5', model: 'meshy-6' }), 'meshy-5')
})

test('resolveTier falls back to the cheap tier on junk', () => {
  assert.equal(resolveTier({}), 'meshy-5')
  assert.equal(resolveTier({ tier: 'meshy-99' }), 'meshy-5')
  assert.equal(resolveTier({ tier: 42 }), 'meshy-5')
  assert.equal(resolveTier(undefined), 'meshy-5')
})
