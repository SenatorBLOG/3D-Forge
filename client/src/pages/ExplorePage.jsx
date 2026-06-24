import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

/** The community gallery: models published by everyone, with free-text search,
 *  tag filters, and an "All / Following" feed switch. Active tag/query/feed live
 *  in the URL so views are shareable. */
export default function ExplorePage() {
  const { user, token } = useAuth()
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') || ''
  const q = params.get('q') || ''
  // Following feed only applies when signed in
  const feed = user && params.get('feed') === 'following' ? 'following' : 'all'

  const [posts, setPosts] = useState(null)
  const [tags, setTags] = useState([])
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(q) // controlled search box

  // merge changes into the URL; empty values drop the param
  const update = (next) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  useEffect(() => {
    setDraft(q)
  }, [q])

  // reload the feed whenever the tag / query / feed changes
  useEffect(() => {
    let cancelled = false
    const qs = new URLSearchParams()
    if (tag) qs.set('tag', tag)
    if (q) qs.set('q', q)
    if (feed === 'following') qs.set('following', '1')
    const headers = feed === 'following' && token ? { Authorization: `Bearer ${token}` } : {}
    setPosts(null)
    fetch(`/api/posts?${qs}`, { headers })
      .then(async (r) => {
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
        setPosts(d.posts)
        setError(null)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [tag, q, feed, token])

  // popular tags for the filter row (once)
  useEffect(() => {
    let cancelled = false
    fetch('/api/posts/tags')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setTags(d.tags || [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = tag || q
  const empty =
    feed === 'following' ? 'No posts from people you follow yet — follow some makers.'
    : tag && q ? `No models tagged #${tag} match “${q}”.`
    : tag ? `No models tagged #${tag} yet.`
    : q ? `No models match “${q}”.`
    : 'No posts yet — publish one from the Forge.'

  return (
    <div className="explore">
      <div className="explore-head">
        <h1>Explore</h1>
        <p className="hint">Models forged by the community.</p>
      </div>

      {user && (
        <div className="explore-feed-tabs">
          <button
            className={`feed-tab ${feed === 'all' ? 'active' : ''}`}
            onClick={() => update({ feed: '' })}
          >
            All
          </button>
          <button
            className={`feed-tab ${feed === 'following' ? 'active' : ''}`}
            onClick={() => update({ feed: 'following' })}
          >
            Following
          </button>
        </div>
      )}

      <form
        className="explore-search"
        onSubmit={(e) => {
          e.preventDefault()
          update({ q: draft.trim() })
        }}
      >
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search models by title or tag…"
          aria-label="Search models"
        />
        <button className="submit" type="submit">
          Search
        </button>
      </form>

      {tags.length > 0 && (
        <div className="explore-tags">
          {tags.map((t) => (
            <button
              key={t.tag}
              className={`tag ${tag === t.tag ? 'active' : ''}`}
              onClick={() => update({ tag: tag === t.tag ? '' : t.tag })}
            >
              #{t.tag} <span className="tag-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtered && (
        <div className="explore-active">
          <span className="hint">
            {tag && (
              <>
                tag <strong>#{tag}</strong>
              </>
            )}
            {tag && q && ' · '}
            {q && (
              <>
                search <strong>“{q}”</strong>
              </>
            )}
            {posts && ` · ${posts.length} result${posts.length === 1 ? '' : 's'}`}
          </span>
          <button className="link-button" onClick={() => update({ tag: '', q: '' })}>
            Clear
          </button>
        </div>
      )}

      {error && <span className="url-error">{error}</span>}
      {posts && posts.length === 0 && <p className="explore-empty">{empty}</p>}
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
