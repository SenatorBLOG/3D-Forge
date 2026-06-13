import test from 'node:test'
import assert from 'node:assert/strict'
import { toCsv, COLUMNS } from '../src/services/dataset.js'

test('CSV has a header and one row per record', () => {
  const csv = toCsv([
    { taskId: 't1', promptMode: 'spatial', instruction: 'bigger', evaluation: 4 },
    { taskId: 't2', promptMode: 'plain', instruction: 'smaller', evaluation: null },
  ])
  const lines = csv.split('\n')
  assert.equal(lines[0], COLUMNS.join(','))
  assert.equal(lines.length, 3)
  assert.ok(lines[1].startsWith('t1,'))
})

test('CSV quotes commas, quotes, and newlines per RFC 4180', () => {
  const csv = toCsv([
    { taskId: 't1', instruction: 'make it "big", then bigger\nand taller' },
  ])
  const row = csv.split('\n').slice(1).join('\n') // value itself contains a newline
  assert.ok(row.includes('"make it ""big"", then bigger\nand taller"'))
})

test('null and undefined cells render as empty', () => {
  const csv = toCsv([{ taskId: 't1', modelUrl: null }])
  const cells = csv.split('\n')[1].split(',')
  // modelUrl column is empty, taskId column is present
  assert.equal(cells[COLUMNS.indexOf('modelUrl')], '')
  assert.equal(cells[COLUMNS.indexOf('taskId')], 't1')
})
