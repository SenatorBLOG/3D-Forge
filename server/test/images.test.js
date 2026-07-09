import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  createImage,
  getImage,
  listImages,
  listVersions,
  imageDataUri,
  IMAGE_DIR,
} from '../src/services/images.js'

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

test('imageDataUri inlines a stored image as a base64 data URI', async () => {
  const id = 'test-datauri-1'
  await createImage({ id, url: `/images/${id}.png`, source: 'upload', mime: 'image/png' })
  mkdirSync(IMAGE_DIR, { recursive: true })
  const file = join(IMAGE_DIR, `${id}.png`)
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  try {
    const uri = await imageDataUri(id)
    assert.ok(uri.startsWith('data:image/png;base64,'))
    assert.ok(uri.length > 'data:image/png;base64,'.length)
  } finally {
    rmSync(file, { force: true })
  }
})

test('imageDataUri returns null for an unknown id', async () => {
  assert.equal(await imageDataUri('does-not-exist'), null)
})

test('listVersions returns the whole family from any member, oldest-first', async () => {
  // v1 → v2 → v3, plus v4 branched off v1 (like clicking an older card and editing)
  await createImage({ id: 'ver-1', url: '/images/ver-1.png', source: 'generated', prompt: 'a car' })
  await createImage({ id: 'ver-2', url: '/images/ver-2.png', source: 'edited', prompt: 'make it red', parentId: 'ver-1' })
  await createImage({ id: 'ver-3', url: '/images/ver-3.png', source: 'edited', prompt: 'add a spoiler', parentId: 'ver-2' })
  await createImage({ id: 'ver-4', url: '/images/ver-4.png', source: 'edited', prompt: 'make it blue', parentId: 'ver-1' })

  // asking from a leaf still yields the full family, rooted at v1
  const { rootId, versions } = await listVersions('ver-3')
  assert.equal(rootId, 'ver-1')
  assert.equal(versions.length, 4)
  assert.deepEqual(new Set(versions.map((v) => v.id)), new Set(['ver-1', 'ver-2', 'ver-3', 'ver-4']))
  assert.equal(versions[0].id, 'ver-1') // root is oldest
  assert.equal(versions[0].version, 1) // 1-based numbering
  assert.equal(versions[versions.length - 1].version, 4)

  // asking from the root gives the same family
  const fromRoot = await listVersions('ver-1')
  assert.equal(fromRoot.versions.length, 4)
})

test('listVersions returns null for an unknown id', async () => {
  assert.equal(await listVersions('no-such-image'), null)
})

test('edited images keep their parentId (version chain)', async () => {
  await createImage({ id: 'img-v1', url: '/images/img-v1.png', source: 'generated', prompt: 'a car' })
  const v2 = await createImage({
    id: 'img-v2',
    url: '/images/img-v2.png',
    source: 'edited',
    prompt: 'make the windows wider',
    parentId: 'img-v1',
  })
  assert.equal(v2.source, 'edited')
  assert.equal(v2.parentId, 'img-v1')
  assert.equal((await getImage('img-v2')).parentId, 'img-v1')
  assert.equal((await getImage('img-v1')).parentId, null)
})
