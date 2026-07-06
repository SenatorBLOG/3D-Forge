import test from 'node:test'
import assert from 'node:assert/strict'
import { THEMES, getTheme, listThemes } from '../src/services/themes.js'
import { createPost, listPosts } from '../src/services/posts.js'

// no MONGODB_URI in tests → the in-memory store is exercised

const u = { id: 'theme-u', username: 'theme_user' }

test('getTheme resolves known ids and rejects unknowns', () => {
  assert.equal(getTheme('fantasy').label, 'Fantasy')
  assert.equal(getTheme('nope'), null)
  assert.equal(getTheme(undefined), null)
})

test('anyTags filters the feed to posts carrying any theme tag', async () => {
  await createPost(u, { title: 'Dragon Axe', modelUrl: '/m.glb', tags: ['dragon', 'weapon'] })
  await createPost(u, { title: 'Space Probe', modelUrl: '/m.glb', tags: ['scifi'] })
  await createPost(u, { title: 'Plain Cube', modelUrl: '/m.glb', tags: ['study'] })

  const fantasy = await listPosts({ anyTags: getTheme('fantasy').tags })
  assert.ok(fantasy.some((p) => p.title === 'Dragon Axe'))
  assert.ok(!fantasy.some((p) => p.title === 'Space Probe'))
  assert.ok(!fantasy.some((p) => p.title === 'Plain Cube'))

  const scifi = await listPosts({ anyTags: getTheme('sci-fi').tags })
  assert.ok(scifi.some((p) => p.title === 'Space Probe'))
})

test('listThemes returns every theme with a live count', async () => {
  const themes = await listThemes()
  assert.equal(themes.length, THEMES.length)
  const fantasy = themes.find((t) => t.id === 'fantasy')
  assert.ok(fantasy.count >= 1) // Dragon Axe from the previous test
  for (const t of themes) {
    assert.ok(typeof t.label === 'string' && Array.isArray(t.tags))
    assert.ok(Number.isInteger(t.count))
  }
})
