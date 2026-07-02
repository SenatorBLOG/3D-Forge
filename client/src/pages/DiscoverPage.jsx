import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'

/** Discover: browse the community by theme (popular tags) and by creator.
 *  Reuses the public feed + tags endpoints; creators are aggregated client-side. */
export default function DiscoverPage() {
  const [params, setParams] = useSearchParams()
  const theme = params.get('theme') || ''
  const [posts, setPosts] = useState(null)
  const [themes, setThemes] = useState([])
  const [creators, setCreators] = useState([])

  // popular tags → the theme filters
  useEffect(() => {
    let cancelled = false
    fetch('/api/posts/tags')
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => {
        if (!cancelled) setThemes(d.tags || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // top creators, aggregated from the full feed
  useEffect(() => {
    let cancelled = false
    fetch('/api/posts')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => {
        if (cancelled) return
        const counts = new Map()
        for (const p of d.posts || []) counts.set(p.authorUsername, (counts.get(p.authorUsername) || 0) + 1)
        setCreators(
          [...counts.entries()]
            .map(([username, count]) => ({ username, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // the grid, filtered by the active theme (tag)
  useEffect(() => {
    let cancelled = false
    const qs = theme ? `?tag=${encodeURIComponent(theme)}` : ''
    setPosts(null)
    fetch(`/api/posts${qs}`)
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => {
        if (!cancelled) setPosts(d.posts || [])
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
    return () => {
      cancelled = true
    }
  }, [theme])

  const pickTheme = (t) => {
    const p = new URLSearchParams(params)
    if (t) p.set('theme', t)
    else p.delete('theme')
    setParams(p, { replace: true })
  }

  return (
    <div className="discover">
      <div className="discover-head">
        <h1>Discover</h1>
        <p className="hint">Browse the community by theme and creator.</p>
      </div>

      <div className="discover-themes">
        <button className={`tag ${theme ? '' : 'active'}`} onClick={() => pickTheme('')}>
          All
        </button>
        {themes.map((t) => (
          <button
            key={t.tag}
            className={`tag ${theme === t.tag ? 'active' : ''}`}
            onClick={() => pickTheme(theme === t.tag ? '' : t.tag)}
          >
            #{t.tag} <span className="tag-count">{t.count}</span>
          </button>
        ))}
      </div>

      {creators.length > 0 && (
        <section className="discover-creators">
          <h2>Top creators</h2>
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

      <h2 className="discover-grid-title">{theme ? `#${theme}` : 'Latest models'}</h2>
      {posts && posts.length === 0 && (
        <EmptyState
          icon="search"
          title={theme ? `Nothing tagged #${theme} yet` : 'No models here yet'}
          hint="Be the first to publish one in this theme."
        />
      )}
      {posts && posts.length > 0 && (
        <div className="explore-grid">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
      {!posts && <CardSkeleton count={8} />}
    </div>
  )
}
