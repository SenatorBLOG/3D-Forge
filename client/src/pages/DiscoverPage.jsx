import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import Avatar from '../components/Avatar.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'
import { getThumbnail } from '../lib/thumbnailer.js'

/** A big featured model at the top of Discover. */
function Spotlight({ post }) {
  const [thumb, setThumb] = useState(null)
  useEffect(() => {
    let cancelled = false
    getThumbnail(post.modelUrl)
      .then((u) => !cancelled && setThumb(u))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [post.modelUrl])

  return (
    <Link className="spotlight" to={`/post/${post.id}`}>
      <div className="spotlight-thumb">
        {thumb ? <img src={thumb.shaded} alt={post.title} /> : <div className="spotlight-ph" />}
      </div>
      <div className="spotlight-meta">
        <span className="spotlight-kicker">✦ Featured today</span>
        <h2 className="spotlight-title">{post.title}</h2>
        <span className="spotlight-author">
          <Avatar username={post.authorUsername} size={22} /> @{post.authorUsername}
        </span>
        {post.description && <p className="spotlight-desc">{post.description}</p>}
        <span className="spotlight-stats">
          ♥ {post.likes ?? 0} · {post.comments ?? 0} comments
        </span>
        <span className="submit spotlight-cta">Open model →</span>
      </div>
    </Link>
  )
}

/** Discover = a CURATED showcase (spotlight, collections, creators). Actual
 *  search / filtering lives on Explore — theme chips and "see all" link there,
 *  so the two pages have distinct jobs. */
export default function DiscoverPage() {
  const [posts, setPosts] = useState(null)
  const [themes, setThemes] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/posts/tags')
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => !cancelled && setThemes(d.tags || []))
      .catch(() => {})
    fetch('/api/posts')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => !cancelled && setPosts(d.posts || []))
      .catch(() => !cancelled && setPosts([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (!posts) {
    return (
      <div className="discover">
        <div className="discover-head">
          <h1>Discover</h1>
          <p className="hint">Curated models, collections and creators from the community.</p>
        </div>
        <CardSkeleton count={8} />
      </div>
    )
  }

  // spotlight = most-liked model; collections = top themes with ≥2 models;
  // creators aggregated from the feed
  const spotlight = [...posts].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))[0]
  const collections = themes
    .map((t) => ({ tag: t.tag, items: posts.filter((p) => p.tags?.includes(t.tag)).slice(0, 4) }))
    .filter((c) => c.items.length >= 2)
    .slice(0, 3)

  const counts = new Map()
  for (const p of posts) counts.set(p.authorUsername, (counts.get(p.authorUsername) || 0) + 1)
  const creators = [...counts.entries()]
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  const fresh = posts.slice(0, 8)

  return (
    <div className="discover">
      <div className="discover-head">
        <h1>Discover</h1>
        <p className="hint">Curated models, collections and creators from the community.</p>
      </div>

      {spotlight && <Spotlight post={spotlight} />}

      {themes.length > 0 && (
        <section className="discover-section">
          <span className="home-themes-label">Browse by theme</span>
          <div className="theme-chips">
            {themes.map((t) => (
              <Link key={t.tag} className="theme-chip" to={`/explore?tag=${encodeURIComponent(t.tag)}`}>
                #{t.tag} <span className="tag-count">{t.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {collections.map((c) => (
        <section className="discover-collection" key={c.tag}>
          <div className="discover-collection-head">
            <h2 className="discover-section-title">#{c.tag}</h2>
            <Link className="link-button" to={`/explore?tag=${encodeURIComponent(c.tag)}`}>
              See all →
            </Link>
          </div>
          <div className="explore-grid">
            {c.items.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      ))}

      {creators.length > 0 && (
        <section className="discover-creators">
          <h2 className="discover-section-title">Top creators</h2>
          <div className="creator-strip">
            {creators.map((c) => (
              <Link key={c.username} to={`/u/${c.username}`} className="creator-tile">
                <Avatar username={c.username} size={52} />
                <span className="creator-name">@{c.username}</span>
                <span className="creator-count">
                  {c.count} model{c.count === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="discover-collection">
          <div className="discover-collection-head">
            <h2 className="discover-section-title">Fresh drops</h2>
            <Link className="link-button" to="/explore">
              Explore all →
            </Link>
          </div>
          <div className="explore-grid">
            {fresh.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
