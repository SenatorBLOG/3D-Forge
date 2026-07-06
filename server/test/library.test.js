import test from 'node:test'
import assert from 'node:assert/strict'
import { recordTask, updateTask } from '../src/services/history.js'
import { listLibrary } from '../src/services/library.js'
import { toggleFavorite, favoriteIds } from '../src/services/favorites.js'

// no MONGODB_URI in tests → in-memory history + favorites are exercised

// seed some generations (newest-first ring buffer)
recordTask({ kind: 'generate', taskId: 'lib-1', prompt: 'a red dragon', mock: true, ownerId: 'u1' })
recordTask({ kind: 'generate', taskId: 'lib-2', prompt: 'a blue mech', mock: true, ownerId: 'u2' })
recordTask({ kind: 'generate', taskId: 'lib-3', prompt: 'dragon rider', mock: true, ownerId: 'u1' })
recordTask({ kind: 'edit', taskId: 'lib-edit', prompt: 'not a library item', mock: true })
updateTask('lib-1', 'SUCCEEDED', '/models/robotic_hand.glb')

test('listLibrary returns generate entries newest-first with totals', async () => {
  const { models, total } = await listLibrary({})
  assert.ok(total >= 3)
  assert.ok(models.every((m) => m.taskId !== 'lib-edit')) // edits excluded
  const ids = models.map((m) => m.taskId)
  assert.ok(ids.indexOf('lib-3') < ids.indexOf('lib-1')) // newest first
})

test('owner=me filters to the caller', async () => {
  const { models } = await listLibrary({ userId: 'u1', owner: 'me' })
  assert.ok(models.length >= 2)
  assert.ok(models.every((m) => m.ownerId === 'u1'))
})

test('q searches the prompt case-insensitively', async () => {
  const { models, total } = await listLibrary({ q: 'DRAGON' })
  assert.ok(total >= 2)
  assert.ok(models.every((m) => m.prompt.toLowerCase().includes('dragon')))
})

test('pagination slices but total counts all matches', async () => {
  const all = await listLibrary({ q: 'dragon' })
  const page = await listLibrary({ q: 'dragon', limit: 1, offset: 1 })
  assert.equal(page.models.length, 1)
  assert.equal(page.total, all.total)
  assert.equal(page.models[0].taskId, all.models[1].taskId)
})

test('favorites toggle on/off and filter the library', async () => {
  assert.deepEqual(await toggleFavorite('u1', 'lib-2'), { favorite: true })
  assert.ok((await favoriteIds('u1')).has('lib-2'))

  const favs = await listLibrary({ userId: 'u1', onlyFavorites: true })
  assert.equal(favs.total, 1)
  assert.equal(favs.models[0].taskId, 'lib-2')
  assert.equal(favs.models[0].favorite, true)

  assert.deepEqual(await toggleFavorite('u1', 'lib-2'), { favorite: false })
  assert.equal((await listLibrary({ userId: 'u1', onlyFavorites: true })).total, 0)
})

test('anonymous callers get favorite:false and no favorites set', async () => {
  const { models } = await listLibrary({})
  assert.ok(models.every((m) => m.favorite === false))
  assert.equal((await favoriteIds(null)).size, 0)
})
