import test from 'node:test'
import assert from 'node:assert/strict'
import { createPost, listPosts, getPost } from '../src/services/posts.js'

// no MONGODB_URI in tests → the in-memory store is exercised

const alice = { id: 'u-alice', username: 'alice' }
const bob = { id: 'u-bob', username: 'bob' }

test('createPost stores author + returns a public shape', async () => {
  const p = await createPost(alice, {
    title: 'My dragon',
    modelUrl: '/models/robotic_hand.glb',
    description: 'a dragon',
  })
  assert.equal(p.title, 'My dragon')
  assert.equal(p.authorUsername, 'alice')
  assert.ok(p.id)
  assert.ok(p.createdAt)
  const fetched = await getPost(p.id)
  assert.equal(fetched.id, p.id)
})

test('listPosts returns newest first and filters by author', async () => {
  await createPost(bob, { title: 'Bob one', modelUrl: '/m.glb' })
  await createPost(bob, { title: 'Bob two', modelUrl: '/m.glb' })
  const all = await listPosts()
  assert.equal(all[0].title, 'Bob two') // newest first
  const bobs = await listPosts({ authorId: 'u-bob' })
  assert.ok(bobs.length >= 2)
  assert.ok(bobs.every((p) => p.authorUsername === 'bob'))
})

test('getPost returns null for unknown id', async () => {
  assert.equal(await getPost('does-not-exist'), null)
})
