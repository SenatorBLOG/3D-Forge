import { dbReady } from '../db.js'
import Wallet from '../models/Wallet.js'
import { load, flush } from './persistence.js'

// 3D-token wallet: a per-user balance plus a transaction ledger. In-memory when
// no Mongo (keyless dev), Mongo when connected — same dual-store pattern as the
// rest of the project. Tokens are simulated; B2 decides when a spend is charged
// (mock mode stays free), this module just does the bookkeeping.

// New accounts get a starter balance so a first-time user can generate
// immediately without a "buy" step. Tune freely — purely simulated.
export const STARTER_TOKENS = 100
const MAX_HISTORY = 100

const memWallets = new Map() // userId -> { balance, history: [newest-first] }
let memSeq = 1

// Hydrate from the dev file (no-op under Mongo/tests). Stored as a plain
// { wallets: { userId: {balance, history} }, seq } object.
{
  const saved = load('wallet', null)
  if (saved) {
    for (const [userId, w] of Object.entries(saved.wallets || {})) {
      memWallets.set(userId, { balance: w.balance || 0, history: w.history || [] })
    }
    memSeq = saved.seq ?? memSeq
  }
}

const saveWallet = () => {
  const wallets = {}
  for (const [userId, w] of memWallets) wallets[userId] = w
  flush('wallet', { wallets, seq: memSeq })
}

const insufficient = () =>
  Object.assign(new Error('Insufficient tokens'), { code: 'INSUFFICIENT', status: 402 })

const publicEntry = (e) => ({
  id: e.id,
  amount: e.amount,
  reason: e.reason || '',
  balanceAfter: e.balanceAfter,
  createdAt: e.createdAt,
})

// --- in-memory helpers ---

const memWalletOf = (userId) => {
  let w = memWallets.get(userId)
  if (!w) {
    w = { balance: 0, history: [] }
    memWallets.set(userId, w)
  }
  return w
}

const memTxn = (userId, amount, reason) => {
  const w = memWalletOf(userId)
  w.balance += amount
  const entry = {
    id: String(memSeq++),
    amount,
    reason: reason || '',
    balanceAfter: w.balance,
    createdAt: new Date().toISOString(),
  }
  w.history.unshift(entry)
  if (w.history.length > MAX_HISTORY) w.history.pop()
  saveWallet()
  return publicEntry(entry)
}

// --- public API ---

/** Current balance + transaction ledger (newest-first). Empty wallet if none. */
export async function getWallet(userId) {
  if (dbReady()) {
    const doc = await Wallet.findOne({ userId }).lean()
    if (!doc) return { balance: 0, history: [] }
    const history = (doc.history || [])
      .map((e) => publicEntry({ ...e, id: String(e._id) }))
      .reverse() // stored oldest-first → return newest-first
    return { balance: doc.balance || 0, history }
  }
  const w = memWallets.get(userId)
  if (!w) return { balance: 0, history: [] }
  return { balance: w.balance, history: w.history.map(publicEntry) }
}

/** Add `amount` (positive) tokens; records a ledger entry. Returns the entry. */
export async function grant(userId, amount, reason) {
  if (!(Number.isFinite(amount) && amount > 0)) throw new Error('grant amount must be a positive finite number')
  if (dbReady()) {
    let doc = await Wallet.findOne({ userId })
    if (!doc) doc = new Wallet({ userId, balance: 0, history: [] })
    doc.balance += amount
    doc.history.push({ amount, reason: reason || '', balanceAfter: doc.balance })
    if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY)
    await doc.save()
    const e = doc.history[doc.history.length - 1]
    return publicEntry({ ...e.toObject(), id: String(e._id) })
  }
  return memTxn(userId, amount, reason)
}

/** Deduct `amount` (positive) tokens; throws INSUFFICIENT if the balance is too low. */
export async function spend(userId, amount, reason) {
  if (!(Number.isFinite(amount) && amount > 0)) throw new Error('spend amount must be a positive finite number')
  if (dbReady()) {
    // Atomic check-and-decrement: the balance guard and the deduction happen in
    // one update so two concurrent spends can't both pass the check (over-spend).
    const doc = await Wallet.findOneAndUpdate(
      { userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    )
    if (!doc) throw insufficient()
    doc.history.push({ amount: -amount, reason: reason || '', balanceAfter: doc.balance })
    if (doc.history.length > MAX_HISTORY) doc.history = doc.history.slice(-MAX_HISTORY)
    await doc.save()
    const e = doc.history[doc.history.length - 1]
    return publicEntry({ ...e.toObject(), id: String(e._id) })
  }
  const w = memWalletOf(userId)
  if (w.balance < amount) throw insufficient()
  return memTxn(userId, -amount, reason)
}

/**
 * Grant the one-time starter balance to a new account. Idempotent: returns null
 * (no double grant) if the user already has a wallet.
 */
export async function grantStarter(userId) {
  if (dbReady()) {
    if (await Wallet.exists({ userId })) return null
    return grant(userId, STARTER_TOKENS, 'starter')
  }
  if (memWallets.has(userId)) return null
  return memTxn(userId, STARTER_TOKENS, 'starter')
}
