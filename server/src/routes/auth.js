import { Router } from 'express'
import { register, login, verifyToken, getUserById } from '../services/auth.js'

const router = Router()

const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/

function validate(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!USERNAME_RE.test(username)) {
    return { error: 'username must be 3-24 chars: letters, digits, underscore' }
  }
  if (password.length < 6 || password.length > 200) {
    return { error: 'password must be 6-200 characters' }
  }
  return { username, password }
}

router.post('/register', async (req, res) => {
  const v = validate(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  try {
    res.status(201).json(await register(v.username, v.password))
  } catch (err) {
    if (err.code === 'TAKEN') return res.status(409).json({ error: err.message })
    console.error('register failed:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req, res) => {
  const v = validate(req.body)
  if (v.error) return res.status(400).json({ error: v.error })
  try {
    res.json(await login(v.username, v.password))
  } catch (err) {
    if (err.code === 'BAD_CREDS') return res.status(401).json({ error: err.message })
    console.error('login failed:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

// GET /api/auth/me — resolve the bearer token to the current user
router.get('/me', async (req, res) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const claims = token && verifyToken(token)
  if (!claims) return res.status(401).json({ error: 'Not authenticated' })
  const user = await getUserById(claims.id)
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  res.json({ user })
})

export default router
