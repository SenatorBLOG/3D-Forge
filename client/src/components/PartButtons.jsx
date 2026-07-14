import { useEffect, useState } from 'react'

/**
 * P3 — part buttons under the model. Segments the model (POST /api/edit/segment)
 * and shows a button per part: hover highlights that part's bbox in the viewer,
 * click regenerates ONLY that part (part-swap), keeping the rest. Works key-free
 * on the built-in geometric segmentation; real Tripo segmentation slots in later.
 */
export default function PartButtons({ modelUrl, onHoverPart, onPickPart, busy }) {
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setParts([])
    onHoverPart?.(null)
    if (!modelUrl) return
    setLoading(true)
    fetch('/api/edit/segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelUrl }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setParts(d?.parts || []))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl])

  if (loading) return <div className="part-buttons part-buttons--loading">Finding parts…</div>
  if (parts.length < 2) return null // nothing useful to split

  return (
    <div className="part-buttons" onMouseLeave={() => onHoverPart?.(null)}>
      <span className="part-buttons-label">Parts</span>
      {parts.map((p) => (
        <button
          key={p.id}
          type="button"
          className="part-chip"
          disabled={busy}
          onMouseEnter={() => onHoverPart?.(p.bbox)}
          onFocus={() => onHoverPart?.(p.bbox)}
          onClick={() => onPickPart?.(p)}
          title={`Regenerate the "${p.name}" part, keep the rest`}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
