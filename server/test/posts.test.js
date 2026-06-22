import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPost,
  listPosts,
  getPost,
  listTags,
  normalizeTags,
} from '../src/services/posts.js'

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

test('normalizeTags cleans, hyphenates, dedupes and caps', () => {
  assert.deepEqual(normalizeTags('#Robot, sci fi, robot'), ['robot', 'sci-fi'])
  assert.deepEqual(normalizeTags(['A', 'b!', 'c']), ['a', 'c']) // 'b!' is invalid
  assert.equal(normalizeTags('a,b,c,d,e,f,g,h').length, 6) // capped at MAX_TAGS
  assert.deepEqual(normalizeTags(123), [])
})

test('listPosts filters by tag and free-text query', async () => {
  const carl = { id: 'u-carl', username: 'carl' }
  await createPost(carl, { title: 'Neon Dragon', modelUrl: '/m.glb', tags: ['fantasy', 'dragon'] })
  await createPost(carl, { title: 'Steel Mech', modelUrl: '/m.glb', tags: ['robot', 'sci-fi'] })

  const dragons = await listPosts({ tag: 'dragon' })
  assert.ok(dragons.length >= 1)
  assert.ok(dragons.every((p) => p.tags.includes('dragon')))

  const mechs = await listPosts({ q: 'mech' }) // matches title
  assert.ok(mechs.some((p) => p.title === 'Steel Mech'))

  const sci = await listPosts({ q: 'sci-fi' }) // matches a tag
  assert.ok(sci.some((p) => p.tags.includes('sci-fi')))

  const tags = await listTags()
  assert.ok(tags.some((t) => t.tag === 'dragon' && t.count >= 1))
})
