import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import Avatar from '../components/Avatar.jsx'
import EmptyState from '../components/EmptyState.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePaginatedPosts } from '../lib/usePaginatedPosts.js'

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

  const [tags, setTags] = useState([])
  const [creators, setCreators] = useState([]) // B10: creators matching q
  const [draft, setDraft] = useState(q) // controlled search box

  // one filter query string drives the paginated, infinite-scrolling feed
  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (tag) p.set('tag', tag)
    if (q) p.set('q', q)
    if (feed === 'following') p.set('following', '1')
    return p.toString()
  }, [tag, q, feed])
  const { posts, total, error, loadingMore, hasMore, sentinelRef } = usePaginatedPosts(query, token)

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

  // B10 unified search: when a text query is active, also surface matching creators
  useEffect(() => {
    if (!q) {
      setCreators([])
      return undefined
    }
    let cancelled = false
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { creators: [] }))
      .then((d) => !cancelled && setCreators(d.creators || []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [q])

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
            {posts && ` · ${total} result${total === 1 ? '' : 's'}`}
          </span>
          <button className="link-button" onClick={() => update({ tag: '', q: '' })}>
            Clear
          </button>
        </div>
      )}

      {q && creators.length > 0 && (
        <div className="search-creators">
          <span className="home-themes-label">Creators</span>
          {creators.map((c) => (
            <Link key={c.username} className="search-creator" to={`/u/${c.username}`}>
              <Avatar username={c.username} size={22} color={c.avatarColor} />@{c.username}
            </Link>
          ))}
        </div>
      )}

      {error && <span className="url-error">{error}</span>}
      {!posts && !error && <CardSkeleton count={8} />}
      {posts && posts.length === 0 && (
        <EmptyState
          icon={feed === 'following' ? 'star' : 'search'}
          title={filtered || feed === 'following' ? 'No matches' : 'Nothing published yet'}
          hint={empty}
        />
      )}
      {posts && posts.length > 0 && (
        <>
          <div className="explore-grid">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          {/* infinite-scroll sentinel + tail state */}
          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
          {loadingMore && <p className="hint feed-more-hint">Loading more…</p>}
          {!hasMore && total > 24 && <p className="hint feed-end-hint">You’ve reached the end.</p>}
        </>
      )}
    </div>
  )
}
