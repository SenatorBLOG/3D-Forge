import { useEffect, useState } from 'react'
import { toLoadableUrl } from '../lib/modelUrl.js'

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
      fill="currentColor"
    />
  </svg>
)

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
    <path
      d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3zM14 7l3 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/**
 * Version history: lists generations and edits (newest first) from
 * GET /api/history as cards. Succeeded entries reload into the viewer; edits
 * can be given a 1-5 evaluation rating, and the whole dataset can be exported.
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

  // download a finished model's GLB. Same-origin (mock) downloads directly;
  // a cross-origin Meshy URL that blocks fetch falls back to opening the link.
  const downloadModel = async (entry) => {
    const base = String(entry.prompt || entry.instruction || entry.taskId || 'model')
      .slice(0, 40)
      .replace(/[^a-z0-9-_]+/gi, '_')
    try {
      const res = await fetch(toLoadableUrl(entry.modelUrl))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base}.glb`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(entry.modelUrl, '_blank', 'noopener')
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
        {entries.map((entry) => {
          const isEdit = entry.kind === 'edit'
          const done = entry.status === 'SUCCEEDED'
          return (
            <div className={`hcard hcard--${entry.kind}`} key={entry.taskId}>
              <div className="hcard-icon">
                {isEdit ? <EditIcon /> : <SparkIcon />}
              </div>
              <div className="hcard-body">
                <div className="hcard-title">
                  {isEdit ? `"${entry.instruction}"` : entry.prompt}
                </div>
                <div className="hcard-badges">
                  <span className="badge badge-kind">{entry.kind}</span>
                  {isEdit && (
                    <span className={`badge badge-${entry.promptMode}`}>
                      {entry.promptMode}
                    </span>
                  )}
                  <span className={`badge status-${entry.status.toLowerCase()}`}>
                    {entry.status.toLowerCase()}
                  </span>
                </div>
                <div className="hcard-foot">
                  <span className="hcard-time">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  {done && entry.modelUrl && (
                    <button
                      className="history-load"
                      disabled={busy}
                      onClick={() => onLoad(entry)}
                    >
                      Load
                    </button>
                  )}
                  {done && entry.modelUrl && (
                    <button
                      className="history-load"
                      onClick={() => downloadModel(entry)}
                      title="Download this model as .glb"
                    >
                      Download
                    </button>
                  )}
                </div>
                {isEdit && done && (
                  <div className="rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className={`star ${entry.evaluation >= n ? 'on' : ''}`}
                        onClick={() => rate(entry.taskId, n)}
                        title={`${n}/5`}
                        aria-label={`Rate ${n} of 5`}
                      >
                        ★
                      </button>
                    ))}
                    {entry.evaluation != null && (
                      <button
                        className="star-clear"
                        onClick={() => rate(entry.taskId, null)}
                      >
                        clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
