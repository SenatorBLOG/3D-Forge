import test from 'node:test'
import assert from 'node:assert/strict'
import { register, login, verifyToken } from '../src/services/auth.js'

// no MONGODB_URI in tests → the in-memory store is exercised

test('register issues a token that resolves back to the user', async () => {
  const { token, user } = await register('alice_test', 'secret123')
  assert.equal(user.username, 'alice_test')
  assert.ok(user.id)
  const claims = verifyToken(token)
  assert.equal(claims.id, user.id)
  assert.equal(claims.username, 'alice_test')
})

test('duplicate username is rejected', async () => {
  await register('bob_test', 'secret123')
  await assert.rejects(() => register('bob_test', 'other123'), /already taken/)
})

test('login succeeds with the right password and fails otherwise', async () => {
  await register('carol_test', 'secret123')
  const ok = await login('carol_test', 'secret123')
  assert.equal(ok.user.username, 'carol_test')
  await assert.rejects(() => login('carol_test', 'wrongpass'), /Invalid/)
  await assert.rejects(() => login('nobody_test', 'secret123'), /Invalid/)
})

test('verifyToken rejects garbage', () => {
  assert.equal(verifyToken('not-a-token'), null)
})
