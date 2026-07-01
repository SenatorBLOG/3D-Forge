import test from 'node:test'
import assert from 'node:assert/strict'
import { detectImage } from '../src/services/imageType.js'

// pad to >= 12 bytes so the WEBP/length guard is satisfied for every fixture
const pad = (head) => Buffer.concat([Buffer.from(head), Buffer.alloc(12)])

test('detects PNG', () => {
  assert.deepEqual(detectImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), {
    ext: 'png',
    mime: 'image/png',
  })
})

test('detects JPEG', () => {
  assert.deepEqual(detectImage(pad([0xff, 0xd8, 0xff, 0xe0])), { ext: 'jpg', mime: 'image/jpeg' })
})

test('detects GIF', () => {
  assert.deepEqual(detectImage(Buffer.from('GIF89a-------')), { ext: 'gif', mime: 'image/gif' })
})

test('detects WEBP (RIFF....WEBP)', () => {
  const buf = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])
  assert.deepEqual(detectImage(buf), { ext: 'webp', mime: 'image/webp' })
})

test('rejects non-images and too-short buffers', () => {
  assert.equal(detectImage(Buffer.from('not an image at all')), null)
  assert.equal(detectImage(Buffer.from([0x89, 0x50])), null)
  assert.equal(detectImage('glTF'), null) // not a Buffer
})
