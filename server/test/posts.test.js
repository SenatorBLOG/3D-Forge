import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPost,
  listPosts,
  getPost,
  listTags,
  normalizeTags,
  updatePost,
  deletePost,
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

test('updatePost patches only provided fields and normalizes tags', async () => {
  const p = await createPost(alice, { title: 'Old title', modelUrl: '/m.glb', tags: ['a'] })
  const up = await updatePost(p.id, { title: 'New title', tags: '#Robot, sci fi' })
  assert.equal(up.title, 'New title')
  assert.deepEqual(up.tags, ['robot', 'sci-fi'])
  // description was not provided → unchanged
  assert.equal(up.description, '')
  assert.equal((await getPost(p.id)).title, 'New title')
  assert.equal(await updatePost('nope', { title: 'x' }), null)
})

test('deletePost removes the post', async () => {
  const p = await createPost(alice, { title: 'Doomed', modelUrl: '/m.glb' })
  assert.equal(await deletePost(p.id), true)
  assert.equal(await getPost(p.id), null)
  assert.equal(await deletePost(p.id), false) // already gone
})

test('createPost stores a valid kind and returns it on the post', async () => {
  const p = await createPost(alice, {
    title: 'From a photo',
    modelUrl: '/m.glb',
    kind: 'image',
  })
  assert.equal(p.kind, 'image')
  assert.equal((await getPost(p.id)).kind, 'image')
})

test('a bogus kind is stored as null (dropped, not rejected)', async () => {
  const p = await createPost(alice, { title: 'Odd kind', modelUrl: '/m.glb', kind: 'nope' })
  assert.equal(p.kind, null)
})

test('a post created without kind has kind null', async () => {
  const p = await createPost(alice, { title: 'No kind', modelUrl: '/m.glb' })
  assert.equal(p.kind, null)
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

test('likedPostIds + listPosts({ ids }) back the profile Favorites tab', async () => {
  const { toggleLike, likedPostIds } = await import('../src/services/social.js')
  const fan = { id: 'u-fan', username: 'fan' }
  const maker = { id: 'u-maker', username: 'maker' }
  const a = await createPost(maker, { title: 'Liked one', modelUrl: '/models/a.glb' })
  const b = await createPost(maker, { title: 'Ignored one', modelUrl: '/models/b.glb' })

  await toggleLike(fan.id, a.id)
  const ids = await likedPostIds(fan.id)
  assert.ok(ids.includes(a.id))
  assert.ok(!ids.includes(b.id))

  const favs = await listPosts({ ids })
  assert.ok(favs.some((p) => p.id === a.id))
  assert.ok(!favs.some((p) => p.id === b.id))

  // an empty ids list matches nothing, not everything
  assert.deepEqual(await listPosts({ ids: [] }), [])
  // a user with no likes yields no ids
  assert.deepEqual(await likedPostIds('u-nobody'), [])
})
