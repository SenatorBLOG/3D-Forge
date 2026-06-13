import { useEffect, useState } from 'react'

/**
 * Version history: lists generations and edits (newest first) from
 * GET /api/history. Succeeded entries reload into the viewer; edits can be
 * given a 1-5 evaluation rating, and the whole dataset can be exported.
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

  const rate = async (taskId, evaluation) => {
    try {
      const res = await fetch(`/api/dataset/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluation }),
      })
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      setEntries((es) =>
        es.map((e) => (e.taskId === taskId ? { ...e, evaluation } : e)),
      )
    } catch (err) {
      setError(err.message)
    }
  }

  const exportJson = async () => {
    try {
      const res = await fetch('/api/dataset')
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data.records, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '3dforge-dataset.json'
      // Firefox only triggers a programmatic download when the anchor is in
      // the document
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="panel">
      <h2>History</h2>
      <div className="url-row">
        <button onClick={exportJson} disabled={entries.length === 0}>
          Export JSON
        </button>
        <a className="export-link" href="/api/dataset/csv">
          Export CSV
        </a>
      </div>
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
                {entry.kind === 'edit' && ` · ${entry.promptMode}`}
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
            {entry.kind === 'edit' && entry.status === 'SUCCEEDED' && (
              <div className="rating">
                <span>rate:</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`star ${entry.evaluation >= n ? 'on' : ''}`}
                    onClick={() => rate(entry.taskId, n)}
                    title={`${n}/5`}
                  >
                    ★
                  </button>
                ))}
                {entry.evaluation != null && (
                  <button className="star-clear" onClick={() => rate(entry.taskId, null)}>
                    clear
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
