import test from 'node:test'
import assert from 'node:assert/strict'
import { createImage, getImage, listImages } from '../src/services/images.js'

// no MONGODB_URI in tests → the in-memory store is exercised.

test('createImage stores and getImage resolves by id', async () => {
  const created = await createImage({
    id: 'img-upload-1',
    url: '/images/img-upload-1.png',
    source: 'upload',
    mime: 'image/png',
    ownerId: 'u1',
  })
  assert.equal(created.id, 'img-upload-1')
  assert.equal(created.source, 'upload')

  const fetched = await getImage('img-upload-1')
  assert.equal(fetched.url, '/images/img-upload-1.png')
  assert.equal(fetched.ownerId, 'u1')
})

test('getImage returns null for an unknown id', async () => {
  assert.equal(await getImage('nope'), null)
})

test('generated images keep their prompt', async () => {
  const img = await createImage({
    id: 'img-gen-1',
    url: '/images/img-gen-1.svg',
    source: 'generated',
    prompt: 'a tiny dragon',
    mime: 'image/svg+xml',
    ownerId: 'u2',
  })
  assert.equal(img.source, 'generated')
  assert.equal(img.prompt, 'a tiny dragon')
})

test('listImages returns only the owner\'s images, newest-first', async () => {
  await createImage({ id: 'img-a', url: '/images/img-a.png', source: 'upload', ownerId: 'owner-x' })
  await createImage({ id: 'img-b', url: '/images/img-b.png', source: 'upload', ownerId: 'owner-x' })
  await createImage({ id: 'img-c', url: '/images/img-c.png', source: 'upload', ownerId: 'owner-y' })

  const mine = await listImages('owner-x')
  const ids = mine.map((i) => i.id)
  assert.deepEqual(ids, ['img-b', 'img-a']) // newest-first
  assert.ok(!ids.includes('img-c')) // other owner excluded
})
