import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getWallet,
  grant,
  spend,
  grantStarter,
  STARTER_TOKENS,
} from '../src/services/wallet.js'

// no MONGODB_URI in tests → the in-memory store is exercised.
// Each test uses a distinct userId so the shared module store can't collide.

test('a wallet with no activity is empty', async () => {
  const w = await getWallet('w-empty')
  assert.equal(w.balance, 0)
  assert.deepEqual(w.history, [])
})

test('grantStarter grants the starter balance exactly once', async () => {
  const entry = await grantStarter('w-starter')
  assert.equal(entry.amount, STARTER_TOKENS)
  assert.equal(entry.reason, 'starter')
  assert.equal((await getWallet('w-starter')).balance, STARTER_TOKENS)

  // idempotent: a second call does not double-grant
  assert.equal(await grantStarter('w-starter'), null)
  assert.equal((await getWallet('w-starter')).balance, STARTER_TOKENS)
})

test('grant adds tokens and records ledger newest-first', async () => {
  await grant('w-grant', 50, 'bonus')
  await grant('w-grant', 30, 'bonus-2')
  const w = await getWallet('w-grant')
  assert.equal(w.balance, 80)
  assert.equal(w.history.length, 2)
  assert.equal(w.history[0].reason, 'bonus-2') // newest first
  assert.equal(w.history[0].amount, 30)
  assert.equal(w.history[0].balanceAfter, 80)
})

test('spend deducts tokens and logs a negative amount', async () => {
  await grant('w-spend', 100, 'seed')
  const entry = await spend('w-spend', 40, 'gen:m5')
  assert.equal(entry.amount, -40)
  assert.equal(entry.balanceAfter, 60)
  assert.equal((await getWallet('w-spend')).balance, 60)
})

test('spend beyond balance throws INSUFFICIENT and leaves balance untouched', async () => {
  await grant('w-poor', 10, 'seed')
  await assert.rejects(
    () => spend('w-poor', 50, 'gen:m6'),
    (err) => err.code === 'INSUFFICIENT' && err.status === 402,
  )
  assert.equal((await getWallet('w-poor')).balance, 10)
})

test('grant and spend reject non-positive amounts', async () => {
  await assert.rejects(() => grant('w-bad', 0, 'x'))
  await assert.rejects(() => spend('w-bad', -5, 'x'))
})
