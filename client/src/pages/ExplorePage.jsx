import { useEffect, useState } from 'react'
import PostCard from '../components/PostCard.jsx'

/** The community gallery: models published by everyone, newest first. */
export default function ExplorePage() {
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/posts')
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
  }, [])

  return (
    <div className="explore">
      <div className="explore-head">
        <h1>Explore</h1>
        <p className="hint">Models forged by the community.</p>
      </div>
      {error && <span className="url-error">{error}</span>}
      {posts && posts.length === 0 && (
        <p className="explore-empty">No posts yet — publish one from the Forge.</p>
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
