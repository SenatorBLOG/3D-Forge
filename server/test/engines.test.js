import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEngine, engineIsMock, startGeneration, getAnyTask } from '../src/services/engines.js'

// no MESHY_API_KEY / TRIPO_API_KEY in tests → both engines run their mock

test('resolveEngine defaults to meshy and only accepts tripo explicitly', () => {
  assert.equal(resolveEngine('tripo'), 'tripo')
  assert.equal(resolveEngine('meshy'), 'meshy')
  assert.equal(resolveEngine('hyper3d'), 'meshy')
  assert.equal(resolveEngine(undefined), 'meshy')
})

test('both engines are mock without keys', () => {
  assert.equal(engineIsMock('meshy'), true)
  assert.equal(engineIsMock('tripo'), true)
})

test('a tripo text generation yields a pollable mock task', async () => {
  const id = await startGeneration({ engine: 'tripo', mode: 'text', prompt: 'a tiny dragon' })
  assert.match(id, /^mock-/)
  const task = await getAnyTask(id)
  assert.equal(task.id, id)
  assert.ok(['PENDING', 'IN_PROGRESS', 'SUCCEEDED'].includes(task.status))
})

test('a meshy image generation still works through the dispatcher', async () => {
  const id = await startGeneration({
    engine: 'meshy',
    mode: 'image',
    imageInput: { url: '/images/x.png' },
    aiModel: 'meshy-5',
  })
  assert.match(id, /^mock-/)
  assert.ok(await getAnyTask(id))
})

test('getAnyTask returns null for unknown ids of any namespace', async () => {
  assert.equal(await getAnyTask('mock-nope'), null)
  assert.equal(await getAnyTask(42), null)
})
