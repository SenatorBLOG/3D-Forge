import { useCallback, useEffect, useRef, useState } from 'react'

const PAGE = 24

/** Infinite-scroll feed loader for the community wall.
 *
 *  Fetches `/api/posts?<query>` a page at a time and appends as the caller's
 *  `sentinelRef` element scrolls into view (IntersectionObserver, 600px lookahead
 *  so the next page is ready before the user reaches the bottom).
 *
 *  `query` is the filter query string (e.g. "tag=dragon&following=1"); changing
 *  it resets to page one. `token` (optional) is sent as a bearer so signed-in
 *  filters like the Following feed resolve. Returns { posts, total, error,
 *  loadingMore, hasMore, sentinelRef }. `posts` is null until the first page. */
export function usePaginatedPosts(query = '', token) {
  const [posts, setPosts] = useState(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const observerRef = useRef(null)
  const loadingRef = useRef(false) // guards against overlapping page loads
  const postsRef = useRef([]) // live length for offset, free of stale closures
  const totalRef = useRef(0)

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined
  const url = (offset) => {
    const qs = new URLSearchParams(query)
    qs.set('limit', String(PAGE))
    qs.set('offset', String(offset))
    return `/api/posts?${qs}`
  }
  const fetchPage = async (offset) => {
    const r = await fetch(url(offset), { headers: authHeaders })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
    return d
  }

  // first page — reload whenever the filter query (or auth) changes
  useEffect(() => {
    let cancelled = false
    loadingRef.current = true
    setPosts(null)
    setError(null)
    setTotal(0)
    postsRef.current = []
    totalRef.current = 0
    fetchPage(0)
      .then((d) => {
        if (cancelled) return
        postsRef.current = d.posts
        totalRef.current = d.total ?? d.posts.length
        setPosts(d.posts)
        setTotal(totalRef.current)
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => {
        if (!cancelled) loadingRef.current = false
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token])

  const loadMore = useCallback(() => {
    if (loadingRef.current) return
    if (postsRef.current.length >= totalRef.current) return
    loadingRef.current = true
    setLoadingMore(true)
    fetchPage(postsRef.current.length)
      .then((d) => {
        postsRef.current = [...postsRef.current, ...d.posts]
        totalRef.current = d.total ?? totalRef.current
        setPosts(postsRef.current)
        setTotal(totalRef.current)
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        loadingRef.current = false
        setLoadingMore(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, token])

  // Callback ref: attach the IntersectionObserver the moment the sentinel mounts
  // (the sentinel only exists once the first page has rendered, so an effect keyed
  // on loadMore would miss it — its identity doesn't change when posts arrive).
  const sentinelRef = useCallback(
    (node) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      if (node) {
        observerRef.current = new IntersectionObserver(
          (entries) => entries[0].isIntersecting && loadMore(),
          { rootMargin: '600px' },
        )
        observerRef.current.observe(node)
      }
    },
    [loadMore],
  )

  const hasMore = posts ? posts.length < total : false
  return { posts, total, error, loadingMore, hasMore, sentinelRef }
}
