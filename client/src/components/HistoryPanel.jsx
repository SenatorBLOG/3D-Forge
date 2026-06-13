import { useEffect, useState } from 'react'

/**
 * Version history: lists generations and edits (newest first) from
 * GET /api/history; succeeded entries can be loaded back into the viewer.
 */
export default function HistoryPanel({ refreshKey, busy, onLoad }) {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/history')
      .then(async (res) => {
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setEntries(data.entries)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <section className="panel">
      <h2>History</h2>
      {error && <span className="url-error">{error}</span>}
      {!error && entries.length === 0 && (
        <span className="hint">No generations yet — try the Generate panel.</span>
      )}
      <div className="history-list">
        {entries.map((entry) => (
          <div className="history-item" key={entry.taskId}>
            <span className="history-title">
              {entry.kind === 'edit'
                ? `✏️ "${entry.instruction}" → ${entry.regionLabel}`
                : `✨ ${entry.prompt}`}
            </span>
            <div className="history-meta">
              <span>
                {new Date(entry.createdAt).toLocaleString()} ·{' '}
                {entry.status.toLowerCase()}
              </span>
              {entry.status === 'SUCCEEDED' && entry.modelUrl && (
                <button
                  className="history-load"
                  disabled={busy}
                  onClick={() => onLoad(entry)}
                >
                  Load
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
