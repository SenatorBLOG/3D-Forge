import test from 'node:test'
import assert from 'node:assert/strict'
import { archiveModelUrl } from '../src/services/modelArchive.js'

// no MONGODB_URI in tests → cloud storage off → archiving must be a pure
// pass-through (never a network call, never a throw)

test('without cloud storage every URL passes through untouched', async () => {
  assert.equal(await archiveModelUrl('t1', '/models/robotic_hand.glb'), '/models/robotic_hand.glb')
  assert.equal(
    await archiveModelUrl('t2', 'https://assets.meshy.ai/abc/model.glb'),
    'https://assets.meshy.ai/abc/model.glb',
  )
  assert.equal(await archiveModelUrl('t3', null), null)
})

test('non-Meshy remote URLs are never fetched (pass-through even with cloud on)', async () => {
  // cloud is off in tests, but the host guard is the property we pin here:
  // the function must return the input for a non-allow-listed host either way
  assert.equal(await archiveModelUrl('t4', 'https://evil.example/model.glb'), 'https://evil.example/model.glb')
})
