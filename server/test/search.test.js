import test from 'node:test'
import assert from 'node:assert/strict'
import { register, searchUsers } from '../src/services/auth.js'
import { createPost, listPosts } from '../src/services/posts.js'

// no MONGODB_URI in tests → the in-memory stores are exercised

test('searchUsers finds usernames case-insensitively and respects the limit', async () => {
  await register('search_dragonrider', 'password-1')
  await register('search_dragonsmith', 'password-1')
  await register('search_botmaker', 'password-1')

  const hits = await searchUsers('DRAGON')
  const names = hits.map((u) => u.username)
  assert.ok(names.includes('search_dragonrider'))
  assert.ok(names.includes('search_dragonsmith'))
  assert.ok(!names.includes('search_botmaker'))

  assert.equal((await searchUsers('search_dragon', 1)).length, 1)
})

test('searchUsers returns [] for empty or junk queries', async () => {
  assert.deepEqual(await searchUsers(''), [])
  assert.deepEqual(await searchUsers('   '), [])
  assert.deepEqual(await searchUsers(42), [])
})

test('post search by title and tag still powers the combined search', async () => {
  const u = { id: 'search-u', username: 'search_user' }
  await createPost(u, { title: 'Obsidian Golem', modelUrl: '/m.glb', tags: ['golem', 'fantasy'] })
  const byTitle = await listPosts({ q: 'obsidian' })
  assert.ok(byTitle.some((p) => p.title === 'Obsidian Golem'))
  const byTag = await listPosts({ q: 'golem' })
  assert.ok(byTag.some((p) => p.title === 'Obsidian Golem'))
})
