import { useState } from 'react'

/**
 * Manual (seed-based) segmentation UI. Instead of the auto splitter deciding
 * where to cut, the user turns on "mark" mode, clicks the model to drop a named
 * seed on each part (Head, Sword, Arm-L…), then hits "Segment by marks" — the
 * server assigns every triangle to its nearest seed, so parts come out exactly
 * as marked. Free, geometric. The seed list here mirrors the markers the viewer
 * draws; clicking the model is what ADDS a seed (via ForgePage.addMark).
 */
export default function MarkPartsPanel({ marks, onRename, onRemove, onClear, onSegment, busy }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    if (running || marks.length < 2) return
    setError(null)
    setRunning(true)
    try {
      await onSegment()
    } catch (e) {
      setError(e.message || 'Segmentation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mark-parts">
      <p className="spatial-blurb spatial-blurb--sm">
        Click each part of the model to drop a seed, then name it. Every triangle goes to its
        nearest seed — a sword, a shield, a helmet come out as exactly the parts you mark.
      </p>

      {marks.length === 0 ? (
        <p className="hint">No seeds yet — click the model to add one.</p>
      ) : (
        <ul className="mark-list">
          {marks.map((m, i) => (
            <li key={i} className="mark-row">
              <span className="mark-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
              <input
                className="mark-name"
                value={m.label}
                onChange={(e) => onRename(i, e.target.value.slice(0, 40))}
                placeholder={`part ${i + 1}`}
                maxLength={40}
              />
              <button type="button" className="mark-x" onClick={() => onRemove(i)} title="Remove seed">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mark-actions">
        <button
          className="submit"
          onClick={run}
          disabled={running || busy || marks.length < 2}
          title={marks.length < 2 ? 'Drop at least two seeds' : 'Split the model by your seeds'}
        >
          {running ? 'Segmenting…' : `✂ Segment by marks (${marks.length})`}
        </button>
        {marks.length > 0 && (
          <button type="button" className="part-group-cancel" onClick={onClear} disabled={running}>
            Clear
          </button>
        )}
      </div>
      {marks.length === 1 && <span className="hint">Add at least one more seed.</span>}
      {error && <span className="url-error">{error}</span>}
    </div>
  )
}

// mirror the viewer's PART_PALETTE (same order) so the list dots match the on-model markers
const PALETTE = [
  '#ff4d4d', '#4dff4d', '#4d7fff', '#ffd24d', '#b84dff', '#22d3ee',
  '#ff8a4d', '#ff4dd2', '#9dff4d', '#4dffa0', '#ff6b6b', '#6b8cff',
]
