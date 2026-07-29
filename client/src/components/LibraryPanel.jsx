import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { getThumbnail } from '../lib/thumbnailer.js'
import { downloadModel } from '../lib/download.js'

const PAGE = 12

/** One library card: real thumbnail, prompt label, favorite star, download, delete. */
function LibraryCard({ m, onLoad, onFavorite, canFavorite, onDelete }) {
  const [thumb, setThumb] = useState(null)
  const [downloading, setDownloading] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!m.modelUrl) return undefined
    getThumbnail(m.modelUrl)
      .then((u) => !cancelled && setThumb(u.shaded))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [m.modelUrl])

  const download = async () => {
    if (!m.modelUrl || downloading) return
    setDownloading(true)
    try {
      await downloadModel(m.modelUrl, m.prompt || 'model')
    } catch {
      /* non-fatal */
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className={`lib-card ${m.modelUrl ? '' : 'lib-card--pending'}`}>
      <button
        type="button"
        className="lib-thumb"
        onClick={() => m.modelUrl && onLoad(m)}
        title={m.prompt || 'Load into the canvas'}
        disabled={!m.modelUrl}
      >
        {thumb ? <img src={thumb} alt={m.prompt || 'model'} loading="lazy" /> : <span className="lib-thumb-ph" />}
      </button>
      {m.modelUrl && (
        <div className="lib-card-actions">
          <button type="button" onClick={download} disabled={downloading} title="Download .glb">
            {downloading ? '…' : '⤓'}
          </button>
          <button
            type="button"
            className="lib-del"
            onClick={() => onDelete(m)}
            title="Delete from library"
          >
            ✕
          </button>
        </div>
      )}
      <div className="lib-card-foot">
        <span className="lib-prompt" title={m.prompt}>
          {m.prompt || 'Untitled'}
        </span>
        {canFavorite && (
          <button
            type="button"
            className={`lib-star ${m.favorite ? 'on' : ''}`}
            onClick={() => onFavorite(m)}
            title={m.favorite ? 'Unstar' : 'Star'}
            aria-pressed={m.favorite}
          >
            ★
          </button>
        )}
      </div>
    </div>
  )
}

/** A7 — "My generations" library for the Forge right rail. Reads Javid's B8
 *  API (/api/models): paginated generations with All / Mine / ★ filters; click
 *  a card to load it into the canvas. */
export default function LibraryPanel({ refreshKey = 0, busy = false, onLoad }) {
  const { user, token } = useAuth()
  const [filter, setFilter] = useState('all') // all | mine | favorites
  const [models, setModels] = useState(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // signed out → only "all" makes sense
  useEffect(() => {
    if (!user && filter !== 'all') setFilter('all')
  }, [user, filter])

  const fetchPage = async (offset) => {
    const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
    if (filter === 'mine') qs.set('owner', 'me')
    if (filter === 'favorites') qs.set('filter', 'favorites')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`/api/models?${qs}`, { headers })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data // { models, total }
  }

  // reload on filter change / refresh signal (a finished generation or upload).
  // The library is a signed-in space — skip the fetch entirely when logged out.
  useEffect(() => {
    if (!user) {
      setModels(null)
      setTotal(0)
      setError(null)
      return undefined
    }
    let cancelled = false
    setError(null)
    setModels(null)
    fetchPage(0)
      .then((d) => {
        if (cancelled) return
        setModels(d.models)
        setTotal(d.total)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter, refreshKey, token])

  const loadMore = async () => {
    if (loadingMore || !models) return
    setLoadingMore(true)
    try {
      const d = await fetchPage(models.length)
      setModels((prev) => [...(prev || []), ...d.models])
      setTotal(d.total)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const deleteModel = async (m) => {
    if (!window.confirm(`Delete "${m.prompt || 'this model'}" from the library?`)) return
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    try {
      const res = await fetch(`/api/models/${encodeURIComponent(m.taskId)}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      setModels((prev) => (prev || []).filter((x) => x.taskId !== m.taskId))
      setTotal((t) => Math.max(0, t - 1))
    } catch (e) {
      setError(e.message)
    }
  }

  const toggleStar = async (m) => {
    if (!token) return
    try {
      const res = await fetch(`/api/models/${encodeURIComponent(m.taskId)}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const { favorite } = await res.json()
      setModels((prev) =>
        filter === 'favorites' && !favorite
          ? prev.filter((x) => x.taskId !== m.taskId)
          : prev.map((x) => (x.taskId === m.taskId ? { ...x, favorite } : x)),
      )
    } catch {
      /* non-fatal */
    }
  }

  return (
    <section className="panel library-panel">
      <span className="tool-label">Library</span>

      {!user && (
        <div className="lib-signin">
          <p className="hint">Sign in to keep a library of your generations — save, star, and reload them anytime.</p>
          <Link className="tool-cta tool-cta--sm" to="/login">
            Sign in →
          </Link>
        </div>
      )}

      {user && (
        <div className="lib-tabs">
          {[
            ['all', 'All'],
            ['mine', 'Mine'],
            ['favorites', '★'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`lib-tab ${filter === id ? 'active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <span className="url-error">{error}</span>}

      {user && !models && !error && <p className="hint">Loading…</p>}

      {models && models.length === 0 && (
        <p className="hint">
          {filter === 'favorites'
            ? 'No starred models yet — hit ★ on one.'
            : filter === 'mine'
              ? 'Nothing yet — generate or upload a model.'
              : 'No generations yet — try the panel on the left.'}
        </p>
      )}

      {models && models.length > 0 && (
        <div className="lib-grid">
          {models.map((m) => (
            <LibraryCard
              key={m.taskId}
              m={m}
              canFavorite={!!user}
              onFavorite={toggleStar}
              onDelete={deleteModel}
              onLoad={(x) => !busy && onLoad?.({ prompt: x.prompt, modelUrl: x.modelUrl })}
            />
          ))}
        </div>
      )}

      {models && models.length < total && (
        <button className="ghost-button lib-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : `Load more (${total - models.length})`}
        </button>
      )}
    </section>
  )
}
