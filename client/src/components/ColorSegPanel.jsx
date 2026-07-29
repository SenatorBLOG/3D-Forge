import { useState } from 'react'

// paint palette + readable names for the "Selected:" hint
const NAMED = [
  ['#ff4d4d', 'red'], ['#4dff4d', 'green'], ['#4d7fff', 'blue'], ['#ffd24d', 'yellow'],
  ['#b84dff', 'purple'], ['#22d3ee', 'cyan'], ['#ff8a4d', 'orange'], ['#ff4dd2', 'pink'],
  ['#9dff4d', 'lime'], ['#4dffa0', 'mint'], ['#ff6b6b', 'coral'], ['#6b8cff', 'periwinkle'],
]
const PALETTE = NAMED.map(([c]) => c)
const nameOf = (hex) => NAMED.find(([c]) => c.toLowerCase() === (hex || '').toLowerCase())?.[1] || (hex || '')

/**
 * #3 — segment by PAINT. Turn on paint mode: every existing segment gets a
 * colour, then you repaint — same colour = same part. Fill (click a whole
 * segment) to merge/assign, brush to draw finer splits, eyedropper to match an
 * existing colour. "Segment by colour" bakes the painted labels into real parts.
 * Exit (✕) leaves the model untouched.
 */
export default function ColorSegPanel({ active, tool, hex, size, onToggle, onSetTool, onPickColor, onSize, onUndo, onSegment, busy }) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const run = async () => {
    if (running) return
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
      <div className="mark-parts-head">
        <span className="part-buttons-label">Paint parts</span>
        <button
          type="button"
          className={`part-label-ai ${active ? 'part-chip--active' : ''}`}
          disabled={busy}
          onClick={() => onToggle(!active)}
          title="Colour the model — same colour = one part"
        >
          {active ? '🎨 Painting… (✕ to exit)' : '🎨 Segment by paint'}
        </button>
      </div>

      {active && (
        <>
          <p className="spatial-blurb spatial-blurb--sm">
            Same colour = one part. <strong>Fill</strong> recolours a whole segment (merge/assign),
            <strong> Brush</strong> paints finer splits, <strong>Eyedropper</strong> grabs a colour to
            match. Then hit <strong>Segment</strong>.
          </p>

          <div className="cs-tools">
            {[
              ['fill', '▣ Fill'],
              ['brush', '✎ Brush'],
              ['eyedropper', '💉 Pick'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`cs-tool ${tool === id ? 'active' : ''}`}
                onClick={() => onSetTool(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="cs-palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`cs-swatch ${hex === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => onPickColor(c)}
                aria-label={`colour ${c}`}
              />
            ))}
          </div>
          <div className="cs-selected">
            <span className="cs-selected-dot" style={{ background: hex }} />
            <span className="hint">
              selected — <strong>{nameOf(hex)}</strong>
            </span>
          </div>

          {tool === 'brush' && (
            <label className="cs-size">
              <span className="hint">Brush size</span>
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={size}
                onChange={(e) => onSize(Number(e.target.value))}
              />
            </label>
          )}

          <div className="mark-actions">
            <button className="submit" onClick={run} disabled={running || busy}>
              {running ? 'Segmenting…' : '✂ Segment by colour'}
            </button>
            <button type="button" className="part-group-cancel" onClick={onUndo} title="Undo the last paint action">
              ↶ Undo
            </button>
          </div>
          {error && <span className="url-error">{error}</span>}
        </>
      )}
    </div>
  )
}
