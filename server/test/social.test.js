import test from 'node:test'
import assert from 'node:assert/strict'
import { toggleLike, likeInfo, addComment, listComments, commentCount } from '../src/services/social.js'

// no MONGODB_URI in tests → in-memory store

const u1 = { id: 'u1', username: 'u1' }
const u2 = { id: 'u2', username: 'u2' }

test('like toggles on and off and counts distinct users', async () => {
  let r = await toggleLike('u1', 'p1')
  assert.deepEqual(r, { liked: true, likes: 1 })
  r = await toggleLike('u2', 'p1')
  assert.equal(r.likes, 2)
  r = await toggleLike('u1', 'p1') // unlike
  assert.deepEqual(r, { liked: false, likes: 1 })
  const info = await likeInfo('p1', 'u1')
  assert.equal(info.likes, 1)
  assert.equal(info.likedByMe, false)
  assert.equal((await likeInfo('p1', 'u2')).likedByMe, true)
})

test('comments append oldest-first and count', async () => {
  await addComment(u1, 'p2', 'first')
  await addComment(u2, 'p2', 'second')
  const list = await listComments('p2')
  assert.equal(list.length, 2)
  assert.equal(list[0].body, 'first')
  assert.equal(list[1].authorUsername, 'u2')
  assert.equal(await commentCount('p2'), 2)
})
