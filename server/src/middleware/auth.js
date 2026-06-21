import { verifyToken, getUserById } from '../services/auth.js'

/** Express middleware: require a valid bearer token; attaches req.user. */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const claims = token && verifyToken(token)
  if (!claims) return res.status(401).json({ error: 'Authentication required' })
  const user = await getUserById(claims.id)
  if (!user) return res.status(401).json({ error: 'Authentication required' })
  req.user = user
  next()
}
