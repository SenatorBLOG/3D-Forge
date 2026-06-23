import test from 'node:test'
import assert from 'node:assert/strict'
import {
  notify,
  listNotifications,
  unreadCount,
  markAllRead,
} from '../src/services/notifications.js'

// no MONGODB_URI in tests → the in-memory store is exercised

const alice = { id: 'a', username: 'alice' }
const bob = { id: 'b', username: 'bob' }

test('notify creates for the recipient and skips self-actions', async () => {
  await notify({ recipientId: 'a', type: 'like', actor: bob, postId: 'p1', postTitle: 'Dragon' })
  const self = await notify({
    recipientId: 'a',
    type: 'like',
    actor: alice, // alice acting on alice's post
    postId: 'p1',
    postTitle: 'Dragon',
  })
  assert.equal(self, null) // no self-notification
  const list = await listNotifications('a')
  assert.equal(list.length, 1)
  assert.equal(list[0].actorUsername, 'bob')
  assert.equal(list[0].type, 'like')
  assert.equal(list[0].read, false)
})

test('unreadCount counts unread and markAllRead clears them', async () => {
  await notify({ recipientId: 'c', type: 'comment', actor: bob, postId: 'p2', postTitle: 'Mech' })
  await notify({ recipientId: 'c', type: 'like', actor: alice, postId: 'p2', postTitle: 'Mech' })
  assert.equal(await unreadCount('c'), 2)
  await markAllRead('c')
  assert.equal(await unreadCount('c'), 0)
  assert.ok((await listNotifications('c')).every((n) => n.read))
})

test('listNotifications is newest-first and scoped to the user', async () => {
  await notify({ recipientId: 'd', type: 'like', actor: bob, postId: 'p3', postTitle: 'One' })
  await notify({ recipientId: 'd', type: 'like', actor: bob, postId: 'p4', postTitle: 'Two' })
  const list = await listNotifications('d')
  assert.equal(list[0].postTitle, 'Two') // newest first
  assert.equal((await listNotifications('nobody')).length, 0) // scoped per user
})
