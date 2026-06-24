import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PostCard from '../components/PostCard.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

/** A user's public profile: avatar, follow stats, and their published models. */
export default function ProfilePage() {
  const { username } = useParams()
  const { user, token } = useAuth()
  const [posts, setPosts] = useState(null)
  const [profile, setProfile] = useState(null) // { followers, following, isFollowing, isSelf }
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
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

  const canFollow = user && profile && !profile.isSelf

  return (
    <div className="profile">
      <div className="profile-head">
        <Avatar username={username} size={64} />
        <div className="profile-head-main">
          <h1 className="profile-name">@{username}</h1>
          {profile && (
            <div className="profile-stats">
              <span>
                <strong>{profile.followers}</strong> follower
                {profile.followers === 1 ? '' : 's'}
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
        {canFollow && (
          <button
            className={profile.isFollowing ? 'ghost-button' : 'submit'}
            onClick={toggleFollow}
            disabled={busy}
          >
            {profile.isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
      {error && <span className="url-error">{error}</span>}
      {posts && posts.length === 0 && (
        <p className="explore-empty">@{username} hasn’t published anything yet.</p>
      )}
      {posts && posts.length > 0 && (
        <div className="explore-grid">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  )
}
