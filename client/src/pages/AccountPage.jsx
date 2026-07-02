import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import Avatar from '../components/Avatar.jsx'
import PostCard from '../components/PostCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'

const Coin = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7l1.4 3.1L16.5 11 13.9 12.9 12 16l-1.9-3.1L7.5 11l3.1-.9z" fill="currentColor" />
  </svg>
)

const reasonLabel = (r) => {
  if (!r) return 'Adjustment'
  if (r === 'starter') return 'Welcome bonus'
  if (r.startsWith('gen')) return 'Generation'
  if (r.includes('refine') || r.includes('texture')) return 'Textures'
  if (r.includes('grant') || r.includes('buy')) return 'Top-up'
  return r
}

const fmtDate = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

const PACKS = [
  { n: 100, price: '$2' },
  { n: 500, price: '$8' },
  { n: 1200, price: '$15' },
]

/** Your private hub: account info, 3D-token balance + full spend history,
 *  your published creations, and account settings. Reads existing endpoints
 *  (GET /api/wallet, GET /api/posts?username=) — no new backend needed. */
export default function AccountPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [wallet, setWallet] = useState(null)
  const [posts, setPosts] = useState(null)
  const [buy, setBuy] = useState(false)

  // not signed in → send to login
  useEffect(() => {
    if (!token) navigate('/login', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (!token || !user) return
    let cancelled = false
    fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setWallet(d))
      .catch(() => {})
    fetch(`/api/posts?username=${encodeURIComponent(user.username)}`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => !cancelled && setPosts(d.posts || []))
      .catch(() => !cancelled && setPosts([]))
    return () => {
      cancelled = true
    }
  }, [token, user])

  if (!user) return null

  const doLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="account">
      <header className="account-head">
        <Avatar username={user.username} size={64} color={user.avatarColor} />
        <div>
          <h1 className="account-name">@{user.username}</h1>
          <p className="hint">Member since {fmtDate(user.createdAt)}</p>
        </div>
        <div className="account-head-actions">
          <Link className="ghost-button" to={`/u/${user.username}`}>
            View public profile
          </Link>
        </div>
      </header>

      <div className="account-grid">
        {/* ---- tokens ---- */}
        <section className="account-card">
          <div className="account-card-head">
            <h2>3D-tokens</h2>
            <button className="submit account-buy" onClick={() => setBuy(true)}>
              Get tokens
            </button>
          </div>
          <div className="account-balance">
            <Coin size={26} />
            <strong>{wallet ? wallet.balance : '—'}</strong>
            <span>available</span>
          </div>

          <h3 className="account-subhead">Activity</h3>
          {!wallet ? (
            <p className="hint">Loading…</p>
          ) : wallet.history && wallet.history.length > 0 ? (
            <ul className="ledger">
              {wallet.history.map((h) => (
                <li className="ledger-row" key={h.id}>
                  <span className="ledger-reason">{reasonLabel(h.reason)}</span>
                  <span className="ledger-date">{fmtDate(h.createdAt)}</span>
                  <span className={`ledger-amt ${h.amount >= 0 ? 'pos' : 'neg'}`}>
                    {h.amount >= 0 ? '+' : ''}
                    {h.amount}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">No activity yet — your spends and top-ups will show here.</p>
          )}
        </section>

        {/* ---- settings ---- */}
        <section className="account-card">
          <div className="account-card-head">
            <h2>Settings</h2>
          </div>
          <ul className="settings-list">
            <li>
              <span className="settings-key">Username</span>
              <span className="settings-val">@{user.username}</span>
            </li>
            <li>
              <span className="settings-key">Profile</span>
              <Link className="link-button" to={`/u/${user.username}`}>
                Edit avatar, banner &amp; bio
              </Link>
            </li>
            <li>
              <span className="settings-key">Password</span>
              <span className="settings-val hint">Change coming soon</span>
            </li>
          </ul>
          <button className="ghost-button danger account-logout" onClick={doLogout}>
            Log out
          </button>
        </section>
      </div>

      {/* ---- creations ---- */}
      <section className="account-creations">
        <div className="account-card-head">
          <h2>Your creations {posts && `(${posts.length})`}</h2>
          <Link className="ghost-button" to="/forge">
            Forge a new model
          </Link>
        </div>
        {!posts ? (
          <CardSkeleton count={4} />
        ) : posts.length > 0 ? (
          <div className="explore-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="box"
            title="You haven’t published anything yet"
            hint="Forge a model and hit Publish to see it here."
            action={
              <Link className="submit" to="/forge">
                Open the Forge
              </Link>
            }
          />
        )}
      </section>

      {buy && (
        <div className="modal-backdrop" onClick={() => setBuy(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Get 3D-tokens</h3>
            <p className="hint">Tokens power your generations — spend them to make models.</p>
            <div className="token-packs">
              {PACKS.map((p) => (
                <div className="token-pack" key={p.n}>
                  <div className="token-pack-n">
                    <Coin size={18} /> {p.n}
                  </div>
                  <div className="token-pack-price">{p.price}</div>
                  <button className="ghost-button" disabled>
                    Soon
                  </button>
                </div>
              ))}
            </div>
            <p className="hint">Checkout is coming soon — tokens are simulated for now.</p>
            <button className="ghost-button modal-close" onClick={() => setBuy(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
