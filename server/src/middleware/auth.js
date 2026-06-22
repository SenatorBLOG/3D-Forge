import { verifyToken, getUserById } from '../services/auth.js'

const userFromHeader = async (req) => {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const claims = token && verifyToken(token)
  return claims ? await getUserById(claims.id) : null
}

/** Express middleware: require a valid bearer token; attaches req.user. */
export async function requireAuth(req, res, next) {
  const user = await userFromHeader(req)
  if (!user) return res.status(401).json({ error: 'Authentication required' })
  req.user = user
  next()
}

/** Attaches req.user when a valid token is present; never rejects. */
export async function optionalAuth(req, res, next) {
  req.user = await userFromHeader(req)
  next()
}
