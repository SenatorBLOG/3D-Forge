import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PostCard from '../components/PostCard.jsx'

/** A user's public profile: their avatar and the models they've published. */
export default function ProfilePage() {
  const { username } = useParams()
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/posts?username=${encodeURIComponent(username)}`)
      .then(async (r) => {
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setPosts(d.posts)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [username])

  return (
    <div className="profile">
      <div className="profile-head">
        <Avatar username={username} size={64} />
        <div>
          <h1 className="profile-name">@{username}</h1>
          <p className="hint">
            {posts ? `${posts.length} published model${posts.length === 1 ? '' : 's'}` : ' '}
          </p>
        </div>
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
