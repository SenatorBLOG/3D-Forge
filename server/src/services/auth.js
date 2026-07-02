import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { dbReady } from '../db.js'
import User from '../models/User.js'
import { load, flush } from './persistence.js'
import { grantStarter } from './wallet.js'

// Accounts persist to Mongo when connected; otherwise an in-memory store keeps
// auth working in the keyless/mock dev setup (same pattern as history/meshy).

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_TTL = '7d'

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set — signing tokens with an insecure dev default. Set JWT_SECRET in production.')
}

const memUsers = new Map() // username -> { id, username, passwordHash, createdAt }
let memSeq = 1

// Hydrate from the dev file (no-op under Mongo/tests). The Map is stored as a
// plain array of users so it round-trips through JSON.
{
  const saved = load('users', null)
  if (saved) {
    for (const u of saved.users || []) memUsers.set(u.username, u)
    memSeq = saved.seq ?? memSeq
  }
}

const saveUsers = () =>
  flush('users', { users: [...memUsers.values()], seq: memSeq })

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  createdAt: u.createdAt,
  bio: u.bio || '',
  avatarColor: u.avatarColor || null,
  bannerId: u.bannerId ?? null,
})

// build the public shape from a Mongo doc (carries the profile fields)
const fromDoc = (doc) =>
  publicUser({
    id: String(doc._id),
    username: doc.username,
    createdAt: doc.createdAt,
    bio: doc.bio,
    avatarColor: doc.avatarColor,
    bannerId: doc.bannerId,
  })

const signToken = (u) =>
  jwt.sign({ sub: u.id, username: u.username }, JWT_SECRET, { expiresIn: TOKEN_TTL })

const taken = () => Object.assign(new Error('Username already taken'), { code: 'TAKEN' })
const badCreds = () =>
  Object.assign(new Error('Invalid username or password'), { code: 'BAD_CREDS' })

// The account already exists by this point, so a wallet-grant hiccup must not
// fail registration (the user couldn't re-register that name). Log and move on.
const grantStarterSafe = async (userId) => {
  try {
    await grantStarter(userId)
  } catch (err) {
    console.error('starter token grant failed:', err)
  }
}

export async function register(username, password) {
  const passwordHash = await bcrypt.hash(password, 10)
  if (dbReady()) {
    if (await User.findOne({ username }).lean()) throw taken()
    const doc = await User.create({ username, passwordHash })
    const u = { id: String(doc._id), username: doc.username, createdAt: doc.createdAt }
    await grantStarterSafe(u.id) // new accounts get a simulated starter balance
    return { token: signToken(u), user: publicUser(u) }
  }
  if (memUsers.has(username)) throw taken()
  const u = {
    id: String(memSeq++),
    username,
    passwordHash,
    createdAt: new Date().toISOString(),
    bio: '',
    avatarColor: null,
    bannerId: null,
  }
  memUsers.set(username, u)
  saveUsers()
  await grantStarterSafe(u.id) // new accounts get a simulated starter balance
  return { token: signToken(u), user: publicUser(u) }
}

export async function login(username, password) {
  let u
  if (dbReady()) {
    const doc = await User.findOne({ username }).lean()
    if (doc) {
      u = {
        id: String(doc._id),
        username: doc.username,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
      }
    }
  } else {
    u = memUsers.get(username)
  }
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) throw badCreds()
  return { token: signToken(u), user: publicUser(u) }
}

/** Verify a JWT; returns { id, username } or null. */
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return { id: payload.sub, username: payload.username }
  } catch {
    return null
  }
}

export async function getUserById(id) {
  if (dbReady()) {
    const doc = await User.findById(id)
      .lean()
      .catch(() => null)
    return doc ? fromDoc(doc) : null
  }
  for (const u of memUsers.values()) if (u.id === id) return publicUser(u)
  return null
}

export async function getUserByUsername(username) {
  if (dbReady()) {
    const doc = await User.findOne({ username }).lean()
    return doc ? fromDoc(doc) : null
  }
  const u = memUsers.get(username)
  return u ? publicUser(u) : null
}

// Update the caller's editable profile fields (bio / avatarColor / bannerId).
// The route validates values before calling this.
export async function updateProfile(userId, fields) {
  if (dbReady()) {
    const doc = await User.findByIdAndUpdate(userId, fields, { new: true })
      .lean()
      .catch(() => null)
    return doc ? fromDoc(doc) : null
  }
  for (const u of memUsers.values()) {
    if (u.id === userId) {
      Object.assign(u, fields)
      saveUsers()
      return publicUser(u)
    }
  }
  return null
}
