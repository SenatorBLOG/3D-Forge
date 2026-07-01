import test from 'node:test'
import assert from 'node:assert/strict'
import { createImageTask, createPreviewTask, getTask } from '../src/services/meshy.js'

// no MESHY_API_KEY in tests → mock mode (no real credits spent).

test('createImageTask returns a pollable mock task in mock mode', async () => {
  const id = await createImageTask('data:image/png;base64,AAAA', { aiModel: 'meshy-5' })
  assert.match(id, /^mock-/)
  const task = await getTask(id)
  assert.equal(task.id, id)
  assert.ok(['PENDING', 'IN_PROGRESS', 'SUCCEEDED'].includes(task.status))
})

test('createPreviewTask still returns a mock task (text path unchanged)', async () => {
  const id = await createPreviewTask('a tiny dragon', 'meshy-6')
  assert.match(id, /^mock-/)
  assert.ok(await getTask(id))
})

test('getTask is null for an unknown id', async () => {
  assert.equal(await getTask('mock-unknown-id'), null)
})
