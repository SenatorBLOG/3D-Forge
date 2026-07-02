import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PostCard from '../components/PostCard.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// deterministic banner gradient per user (dark + one on-brand accent)
const BANNERS = [
  ['#3a2a12', '#ff7a1f'],
  ['#12303a', '#5cc8ff'],
  ['#2a1238', '#a06bff'],
  ['#123a2a', '#3fb970'],
  ['#3a1224', '#ff6b8a'],
  ['#1a2440', '#4a7bff'],
]
const bannerFor = (name = '') => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  const [base, accent] = BANNERS[h % BANNERS.length]
  return {
    backgroundImage: `radial-gradient(600px 200px at 80% -40%, ${accent}55, transparent 70%), linear-gradient(120deg, ${base}, #0b0d12 72%)`,
  }
}

const TABS = [
  { id: 'models', label: 'Models' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'badges', label: 'Badges' },
]

/** A user's profile: banner, avatar, follow stats, share, and tabs. */
export default function ProfilePage() {
  const { username } = useParams()
  const { user, token } = useAuth()
  const [posts, setPosts] = useState(null)
  const [profile, setProfile] = useState(null) // { followers, following, isFollowing, isSelf }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('models')
  const [copied, setCopied] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    setPosts(null)
    setTab('models')
    Promise.all([
      fetch(`/api/posts?username=${encodeURIComponent(username)}`).then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        return d
      }),
      fetch(`/api/users/${encodeURIComponent(username)}`, { headers }).then((r) => r.json()),
    ])
      .then(([p, u]) => {
        if (cancelled) return
        setPosts(p.posts || [])
        setProfile(u && !u.error ? u : null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [username, token])

  const toggleFollow = async () => {
    if (!token || busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const { following, followers } = await res.json()
        setProfile((pr) => ({ ...pr, isFollowing: following, followers }))
      }
    } finally {
      setBusy(false)
    }
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked */
    }
  }

  const isSelf = profile?.isSelf
  const canFollow = user && profile && !isSelf

  return (
    <div className="profile">
      <div className="profile-banner" style={bannerFor(username)} />

      <div className="profile-head">
        <div className="profile-avatar">
          <Avatar username={username} size={88} />
        </div>
        <div className="profile-head-main">
          <h1 className="profile-name">@{username}</h1>
          {profile && (
            <div className="profile-stats">
              <span>
                <strong>{profile.followers}</strong> follower{profile.followers === 1 ? '' : 's'}
              </span>
              <span>
                <strong>{profile.following}</strong> following
              </span>
              <span>
                <strong>{posts ? posts.length : 0}</strong> model
                {posts && posts.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
        <div className="profile-actions">
          {canFollow && (
            <button
              className={profile.isFollowing ? 'ghost-button' : 'submit'}
              onClick={toggleFollow}
              disabled={busy}
            >
              {profile.isFollowing ? 'Following' : 'Follow'}
            </button>
          )}
          {isSelf && (
            <button className="ghost-button" onClick={() => setEditOpen(true)}>
              Edit profile
            </button>
          )}
          <button className="ghost-button" onClick={share}>
            {copied ? 'Link copied' : 'Share'}
          </button>
        </div>
      </div>

      <div className="profile-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`profile-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <span className="url-error">{error}</span>}

      {tab === 'models' &&
        (posts && posts.length === 0 ? (
          <p className="explore-empty">@{username} hasn’t published anything yet.</p>
        ) : posts && posts.length > 0 ? (
          <div className="explore-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <p className="hint">Loading…</p>
        ))}

      {tab === 'favorites' && (
        <p className="explore-empty">Favorites are coming soon.</p>
      )}
      {tab === 'badges' && (
        <p className="explore-empty">Achievements &amp; badges are coming soon.</p>
      )}

      {editOpen && (
        <div className="modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit profile</h3>
            <p className="hint">
              Custom avatar, banner and bio are coming soon. Your @username is set at sign-up.
            </p>
            <button className="ghost-button modal-close" onClick={() => setEditOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
