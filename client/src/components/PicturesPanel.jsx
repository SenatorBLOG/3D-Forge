import { useEffect, useState } from 'react'

/**
 * Library → Pictures. Every image the user makes (Imagine photo, uploaded
 * reference, Gemini edit) is already stored server-side; this surfaces them as a
 * gallery so they stop being invisible dead weight. Clicking one hands it back
 * up (onPick) to start a fresh generation from that picture — pick it, tweak it
 * in Gemini, build a new model — the "I want something like this but changed"
 * flow without re-writing a prompt.
 */
export default function PicturesPanel({ refreshKey = 0, busy = false, onPick }) {
  const [images, setImages] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch('/api/images?limit=120')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => !cancelled && setImages(d.images || []))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const remove = async (id) => {
    setImages((prev) => (prev || []).filter((im) => im.id !== id)) // optimistic
    try {
      await fetch(`/api/images/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      /* best-effort; the card is already gone from view */
    }
  }

  if (error) return <div className="lib-empty">Couldn’t load pictures — {error}</div>
  if (!images) return <div className="lib-empty">Loading pictures…</div>
  if (!images.length) {
    return (
      <div className="lib-empty">
        No pictures yet. Make one in <strong>Imagine</strong> or drop a reference image, and it
        shows up here.
      </div>
    )
  }

  return (
    <div className="pics-grid">
      {images.map((img) => (
        <div key={img.id} className="pic-card-wrap">
          <button
            type="button"
            className="pic-card"
            disabled={busy}
            onClick={() => onPick?.(img)}
            title={img.prompt || img.source}
          >
            <img className="pic-thumb" src={img.url} alt={img.prompt || 'picture'} loading="lazy" />
            <span className="pic-meta">
              <span className="pic-source">{img.source === 'edited' ? '✎ edit' : img.source === 'generated' ? '✨ imagine' : '⬆ upload'}</span>
              {img.prompt && <span className="pic-prompt">{img.prompt}</span>}
            </span>
          </button>
          <button
            type="button"
            className="pic-del"
            onClick={() => remove(img.id)}
            title="Delete this picture"
            aria-label="Delete picture"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
