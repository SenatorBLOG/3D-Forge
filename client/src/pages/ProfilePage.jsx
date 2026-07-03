import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Avatar, { AVATAR_COLORS } from '../components/Avatar.jsx'
import PostCard from '../components/PostCard.jsx'
import EmptyState from '../components/EmptyState.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// banner presets (dark base + one on-brand accent), index stored per user
// Neon Noir banner presets: [dark base, neon accent]
const BANNERS = [
  ['#0a2630', '#22d3ee'],
  ['#2a0f24', '#ff2d9b'],
  ['#1a0f2e', '#a855f7'],
  ['#0c2a1e', '#35e6a4'],
  ['#2e260a', '#ffd23d'],
  ['#101a34', '#5b8cff'],
]
const bannerStyle = (i) => {
  const [base, accent] = BANNERS[((i % BANNERS.length) + BANNERS.length) % BANNERS.length]
  return {
    backgroundImage: `radial-gradient(600px 200px at 80% -40%, ${accent}55, transparent 70%), linear-gradient(120deg, ${base}, #0b0d12 72%)`,
  }
}
const hashIndex = (name = '') => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997
  return h % BANNERS.length
}

const TABS = [
  { id: 'models', label: 'Models' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'badges', label: 'Badges' },
]

/** A user's profile: banner, avatar, bio, follow stats, share, editable by the owner. */
export default function ProfilePage() {
  const { username } = useParams()
  const { user, token } = useAuth()
  const [posts, setPosts] = useState(null)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('models')
  const [copied, setCopied] = useState(false)

  // edit form
  const [editOpen, setEditOpen] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editColor, setEditColor] = useState(null)
  const [editBanner, setEditBanner] = useState(null)
  const [saving, setSaving] = useState(false)

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

  const openEdit = () => {
    setEditBio(profile?.bio || '')
    setEditColor(profile?.avatarColor ?? null)
    setEditBanner(profile?.bannerId ?? null)
    setEditOpen(true)
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bio: editBio, avatarColor: editColor, bannerId: editBanner }),
      })
      const data = await res.json()
      if (res.ok) {
        setProfile((pr) => ({
          ...pr,
          bio: data.user.bio,
          avatarColor: data.user.avatarColor,
          bannerId: data.user.bannerId,
        }))
        setEditOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const isSelf = profile?.isSelf
  const canFollow = user && profile && !isSelf
  const banner =
    profile?.bannerId != null ? bannerStyle(profile.bannerId) : bannerStyle(hashIndex(username))

  return (
    <div className="profile">
      <div className="profile-banner" style={banner} />

      <div className="profile-head">
        <div className="profile-avatar">
          <Avatar username={username} size={88} color={profile?.avatarColor} />
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
          {profile?.bio && <p className="profile-bio">{profile.bio}</p>}
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
            <button className="ghost-button" onClick={openEdit}>
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
          <EmptyState
            icon="box"
            title={isSelf ? 'You haven’t published anything yet' : `@${username} hasn’t published anything yet`}
            hint={isSelf ? 'Forge a model and hit Publish to see it here.' : undefined}
          />
        ) : posts && posts.length > 0 ? (
          <div className="explore-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <CardSkeleton count={4} />
        ))}
      {tab === 'favorites' && (
        <EmptyState icon="star" title="Favorites are coming soon" hint="Models you like will collect here." />
      )}
      {tab === 'badges' && (
        <EmptyState icon="badge" title="Achievements are coming soon" hint="Earn badges as you create and share." />
      )}

      {editOpen && (
        <div className="modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit profile</h3>

            <label className="edit-label">Bio</label>
            <textarea
              className="edit-bio"
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Tell people what you make…"
              rows={3}
              maxLength={160}
            />
            <span className="hint">{160 - editBio.length} characters left</span>

            <label className="edit-label">Avatar colour</label>
            <div className="swatch-row">
              <button
                className={`swatch swatch-default ${editColor == null ? 'active' : ''}`}
                onClick={() => setEditColor(null)}
                title="Default"
              >
                Auto
              </button>
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${editColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setEditColor(c)}
                  aria-label={`avatar ${c}`}
                />
              ))}
            </div>

            <label className="edit-label">Banner</label>
            <div className="swatch-row">
              <button
                className={`swatch swatch-default ${editBanner == null ? 'active' : ''}`}
                onClick={() => setEditBanner(null)}
                title="Default"
              >
                Auto
              </button>
              {BANNERS.map((_, i) => (
                <button
                  key={i}
                  className={`banner-swatch ${editBanner === i ? 'active' : ''}`}
                  style={bannerStyle(i)}
                  onClick={() => setEditBanner(i)}
                  aria-label={`banner ${i + 1}`}
                />
              ))}
            </div>

            <div className="edit-actions">
              <button className="submit" onClick={saveProfile} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="ghost-button" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
