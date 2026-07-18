import { useState } from 'react'
import MicButton from './MicButton.jsx'
import { parseRecolor } from '../lib/recolorParse.js'

/**
 * P2 — surface edit (recolor / re-material) of the CURRENT model without changing
 * its geometry. Runs LOCALLY in the viewer: instant, free, shape untouched. We
 * moved off Tripo's texture_model here — verified live it ignores the colour
 * prompt and just reproduces the original texture while still charging credits.
 * The recoloured model is saved as a new version by the parent (onRecolor).
 */
export default function RecolorPanel({ onRecolor }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const parsed = parseRecolor(prompt)

  const run = async () => {
    const p = prompt.trim()
    if (!p || busy) return
    const hit = parseRecolor(p)
    if (!hit) {
      setError("Couldn't spot a colour — try e.g. “matte black”, “glossy red”, “gold”.")
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onRecolor?.(hit)
    } catch (e) {
      setError(e.message || 'Recolor failed')
    } finally {
      setBusy(false)
    }
  }

  const appendSpeech = (t) => setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))

  return (
    <section className="panel">
      <div className="spatial-head">
        <span className="spatial-flag">🎨 Surface</span>
        <h2>Recolor</h2>
      </div>
      <p className="spatial-blurb">
        Change colour or material by prompt — the shape stays exactly the same (no reshape, no
        drift). Instant &amp; free. Best for “matte black”, “glossy red”, “gold”, “navy blue”.
      </p>
      <div className="input-with-mic">
        <textarea
          className="point-prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "make it matte black" or "glossy deep red"'
          disabled={busy}
        />
        <MicButton onTranscript={appendSpeech} disabled={busy} />
      </div>
      {parsed && (
        <div className="recolor-preview">
          <span className="recolor-swatch" style={{ background: parsed.hex }} aria-hidden="true" />
          <span className="hint">
            will apply <strong>{parsed.label}</strong>
          </span>
        </div>
      )}
      <button className="submit" onClick={run} disabled={busy || !prompt.trim()}>
        {busy ? 'Recoloring…' : '🎨 Recolor (keep shape)'}
      </button>
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
