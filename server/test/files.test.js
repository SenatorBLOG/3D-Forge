import test from 'node:test'
import assert from 'node:assert/strict'
import { cloudFilesEnabled, isSafeFileName } from '../src/services/files.js'

// no MONGODB_URI in tests → cloud storage is off and routes stay on local disk

test('cloud files are disabled without Mongo (disk fallback)', () => {
  assert.equal(cloudFilesEnabled(), false)
})

test('isSafeFileName allows our ids and rejects traversal/junk', () => {
  assert.equal(isSafeFileName('1751791234-ab12cd.png'), true)
  assert.equal(isSafeFileName('model.glb'), true)
  assert.equal(isSafeFileName('../secrets.env'), false)
  assert.equal(isSafeFileName('a/b.png'), false)
  assert.equal(isSafeFileName('a\\b.png'), false)
  assert.equal(isSafeFileName(''), false)
  assert.equal(isSafeFileName('.hidden'), false)
  assert.equal(isSafeFileName(42), false)
})
