import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)
const TOKEN_KEY = '3dforge-token'

/** Holds the auth token (persisted in localStorage) and the current user. */
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!token)

  // validate an existing token once on load
  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (cancelled) return
        if (res.ok) {
          setUser((await res.json()).user)
        } else {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // run once with the initial token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authenticate = async (path, username, password) => {
    const res = await fetch(`/api/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
    return data.user
  }

  const login = (u, p) => authenticate('login', u, p)
  const register = (u, p) => authenticate('register', u, p)
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
