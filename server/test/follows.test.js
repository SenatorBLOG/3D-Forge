import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toggleFollow,
  isFollowing,
  followCounts,
  followingIds,
} from '../src/services/follows.js'

// no MONGODB_URI in tests → the in-memory store is exercised

test('toggleFollow follows then unfollows and counts followers', async () => {
  let r = await toggleFollow('a', 'b')
  assert.deepEqual(r, { following: true, followers: 1 })
  assert.equal(await isFollowing('a', 'b'), true)

  r = await toggleFollow('c', 'b') // a second follower of b
  assert.equal(r.followers, 2)

  r = await toggleFollow('a', 'b') // a unfollows
  assert.deepEqual(r, { following: false, followers: 1 })
  assert.equal(await isFollowing('a', 'b'), false)
})

test('self-follow is a no-op', async () => {
  const r = await toggleFollow('x', 'x')
  assert.equal(r.following, false)
  assert.equal(await isFollowing('x', 'x'), false)
})

test('followCounts and followingIds reflect the graph', async () => {
  await toggleFollow('u1', 'u2')
  await toggleFollow('u1', 'u3')
  const ids = await followingIds('u1')
  assert.deepEqual([...ids].sort(), ['u2', 'u3'])
  const counts = await followCounts('u1')
  assert.equal(counts.following, 2)
  assert.equal(counts.followers, 0)
  assert.equal((await followCounts('u2')).followers, 1)
})
