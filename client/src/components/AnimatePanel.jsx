import { useEffect, useState } from 'react'

// Task 6 — the "Animate" modal. Opens centered over the model. Pick one or
// several animation cards → Animate. Rigging is IMPLICIT: the first Animate rigs
// the model (25 cr) then applies the clips (10 cr each); once a skeleton exists
// (rigTaskId known) later runs skip straight to the clips, so 25 cr is paid once.
// Cards already baked into this model are shown greyed / non-clickable.

// ~10 humanoid presets (Tripo biped rigs). Icons only for v1; motion gifs later.
const PRESETS = [
  ['idle', '🧍'],
  ['walk', '🚶'],
  ['run', '🏃'],
  ['jump', '⬆'],
  ['dive', '🤿'],
  ['climb', '🧗'],
  ['turn', '↩'],
  ['slash', '⚔'],
  ['shoot', '🔫'],
  ['fall', '🍂'],
]

export default function AnimatePanel({ modelUrl, rigTaskId, appliedClips = [], onAnimate, onClose }) {
  const applied = new Set(appliedClips)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState('') // progress text while running
  const [error, setError] = useState(null)
  // free riggability check (only meaningful before the first rig)
  const [check, setCheck] = useState(rigTaskId ? { riggable: true } : null)

  useEffect(() => {
    if (rigTaskId) return // already rigged → definitely riggable
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/animate/prerig', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelUrl }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) setCheck({ riggable: false, reason: data.error })
        else setCheck(data)
      } catch {
        if (!cancelled) setCheck({ riggable: false, reason: 'Could not reach the server' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modelUrl, rigTaskId])

  const toggle = (name) => {
    if (applied.has(name) || busy) return
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const newCount = selected.size
  const cost = (rigTaskId ? 0 : 25) + newCount * 10
  const riggable = check?.riggable !== false

  const run = async () => {
    if (!newCount || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAnimate([...selected], (msg) => setStage(msg))
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
      setStage('')
    }
  }

  return (
    <div className="anim-modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="anim-modal" onClick={(e) => e.stopPropagation()}>
        <div className="anim-modal-head">
          <span className="spatial-flag">🎬 Animate</span>
          <h2>Add animations</h2>
          <button type="button" className="point-popup-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!riggable ? (
          <p className="hint">
            This model can’t be rigged{check?.reason ? ` — ${check.reason}` : ''}. Rigging works on
            Tripo-generated biped characters.
          </p>
        ) : (
          <>
            <p className="anim-modal-blurb">
              Pick one or more. A skeleton is added automatically the first time.
              {appliedClips.length > 0 && ' Greyed clips are already on this model.'}
            </p>
            <div className="anim-grid">
              {PRESETS.map(([name, icon]) => {
                const isApplied = applied.has(name)
                const isSel = selected.has(name)
                return (
                  <button
                    key={name}
                    type="button"
                    className={`anim-card ${isSel ? 'sel' : ''} ${isApplied ? 'done' : ''}`}
                    disabled={isApplied || busy}
                    aria-pressed={isSel}
                    onClick={() => toggle(name)}
                    title={isApplied ? 'Already added' : `Add "${name}"`}
                  >
                    <span className="anim-card-icon" aria-hidden="true">{icon}</span>
                    <span className="anim-card-name">{name}</span>
                    {isApplied && <span className="anim-card-tick" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
            </div>
            {error && <span className="url-error">{error}</span>}
            <button className="submit gen-go" onClick={run} disabled={!newCount || busy}>
              {busy
                ? stage || 'Working…'
                : newCount
                  ? `Animate · ${newCount} · ${cost} cr`
                  : 'Select an animation'}
            </button>
            {!rigTaskId && newCount > 0 && !busy && (
              <span className="hint">Includes skeleton (25 cr) — charged only this first time.</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
