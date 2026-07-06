import test from 'node:test'
import assert from 'node:assert/strict'
import { userStats, BADGES } from '../src/services/stats.js'
import { createPost } from '../src/services/posts.js'
import { toggleLike } from '../src/services/social.js'
import { toggleFollow } from '../src/services/follows.js'
import { recordTask } from '../src/services/history.js'

// no MONGODB_URI in tests → all in-memory stores

const hero = { id: 'stat-hero', username: 'stat_hero' }

test('userStats aggregates creations, posts, likes and follows', async () => {
  // 2 generations, 2 posts, 3 likes, 1 follower
  recordTask({ kind: 'generate', taskId: 'st-1', prompt: 'x', mock: true, ownerId: hero.id })
  recordTask({ kind: 'generate', taskId: 'st-2', prompt: 'y', mock: true, ownerId: hero.id })
  const p1 = await createPost(hero, { title: 'One', modelUrl: '/m.glb' })
  const p2 = await createPost(hero, { title: 'Two', modelUrl: '/m.glb' })
  await toggleLike('fan-1', p1.id)
  await toggleLike('fan-2', p1.id)
  await toggleLike('fan-1', p2.id)
  await toggleFollow('fan-1', hero.id)

  const s = await userStats(hero)
  assert.equal(s.creations, 2)
  assert.equal(s.published, 2)
  assert.equal(s.likesReceived, 3)
  assert.equal(s.followers, 1)
  assert.equal(s.following, 0)
})

test('badges derive from the stats (earned flags)', async () => {
  const s = await userStats(hero)
  const byId = Object.fromEntries(s.badges.map((b) => [b.id, b.earned]))
  assert.equal(byId['first-forge'], true) // has generations
  assert.equal(byId['published'], true) // has posts
  assert.equal(byId['maker-5'], false) // only 2 creations
  assert.equal(byId['liked-10'], false) // only 3 likes
  assert.equal(s.badges.length, BADGES.length) // locked badges included for the UI
})

test('a brand-new user has zeroes and no earned badges', async () => {
  const s = await userStats({ id: 'stat-nobody', username: 'nobody' })
  assert.equal(s.creations + s.published + s.likesReceived + s.followers, 0)
  assert.ok(s.badges.every((b) => b.earned === false))
})
