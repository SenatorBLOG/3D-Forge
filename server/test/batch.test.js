import test from 'node:test'
import assert from 'node:assert/strict'
import { createBatch, getBatch, batchStatus } from '../src/services/batch.js'
import { createImageTask } from '../src/services/meshy.js'

// no MESHY_API_KEY / MONGODB_URI in tests → mock tasks + in-memory batches

test('createBatch / getBatch round-trip', async () => {
  const b = await createBatch({
    ownerId: 'u1',
    tasks: [{ taskId: 't1', imageId: 'i1' }, { taskId: 't2', imageId: 'i2' }],
  })
  assert.match(b.batchId, /^batch-/)
  const fetched = await getBatch(b.batchId)
  assert.equal(fetched.ownerId, 'u1')
  assert.deepEqual(fetched.tasks.map((t) => t.imageId), ['i1', 'i2'])
})

test('getBatch / batchStatus return null for an unknown id', async () => {
  assert.equal(await getBatch('batch-nope'), null)
  assert.equal(await batchStatus('batch-nope'), null)
})

test('batchStatus polls every task and aggregates progress', async () => {
  const t1 = await createImageTask('data:image/png;base64,AA', { aiModel: 'meshy-5' })
  const t2 = await createImageTask('data:image/png;base64,BB', { aiModel: 'meshy-5' })
  const b = await createBatch({
    ownerId: null,
    tasks: [{ taskId: t1, imageId: 'img-a' }, { taskId: t2, imageId: 'img-b' }],
  })

  const s = await batchStatus(b.batchId)
  assert.equal(s.batchId, b.batchId)
  assert.equal(s.tasks.length, 2)
  for (const t of s.tasks) {
    assert.ok(['PENDING', 'IN_PROGRESS', 'SUCCEEDED'].includes(t.status))
    assert.ok(t.progress >= 0 && t.progress <= 100)
    assert.ok(['img-a', 'img-b'].includes(t.imageId))
  }
  assert.ok(s.progress >= 0 && s.progress <= 100)
  assert.equal(typeof s.done, 'boolean')
  assert.equal(s.done, false) // mock tasks take ~8s — still running here
})

test('unknown task ids inside a batch surface as EXPIRED, and the batch settles', async () => {
  const b = await createBatch({ ownerId: null, tasks: [{ taskId: 'gone-1', imageId: 'x' }] })
  const s = await batchStatus(b.batchId)
  assert.equal(s.tasks[0].status, 'EXPIRED')
  assert.equal(s.done, true) // expired counts as settled so the batch can't poll forever
  assert.equal(s.progress, 100)
})
