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
export default function RecolorPanel({ onRecolor, scope = null, onShape }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const parsed = parseRecolor(prompt)
  // one adaptive control: recolor the whole model, OR the selected part / group
  const scopeName = scope ? (scope.kind === 'group' ? scope.group.name : scope.part.name) : null
  const scopeLabel = scope ? `${scope.kind === 'group' ? 'Group' : 'Part'}: ${scopeName}` : 'Whole model'

  const run = async () => {
    const p = prompt.trim()
    if (!p || busy) return
    const hit = parseRecolor(p)
    if (!hit) {
      setError("Couldn't spot a colour — try “matte black”, “glossy red”, or “white to black, blue to red”.")
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
      <div className="recolor-scope">
        <span className="hint">Applying to:</span>
        <span className={`recolor-scope-chip ${scope ? 'on' : ''}`}>{scopeLabel}</span>
        {scope && onShape && (
          <button type="button" className="link-button" onClick={onShape}>
            ✎ change shape
          </button>
        )}
        {scope && <span className="hint">— click the chip again for the whole model</span>}
      </div>
      <p className="spatial-blurb">
        {scope ? (
          <>Tint just this {scope.kind} — e.g. “matte black”, “glossy red”. Instant &amp; free, the rest untouched.</>
        ) : (
          <>Change colour by prompt — shape stays 1:1, instant &amp; free. Tint the whole model
          (“matte black”, “glossy red”) or <strong>swap specific colours</strong>: “white to black,
          blue to red”. Click a part or group to recolor just that.</>
        )}
      </p>
      <div className="input-with-mic">
        <textarea
          className="reactor-input reactor-input--sm"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "matte black" or "white to black, blue to red"'
          disabled={busy}
        />
        <MicButton onTranscript={appendSpeech} disabled={busy} />
      </div>
      <div className="seed-row">
        <span className="seed-label">Try</span>
        {['matte black', 'glossy red', 'white to black, blue to red'].map((p) => (
          <button key={p} type="button" className="seed" onClick={() => setPrompt(p)} disabled={busy}>
            {p}
          </button>
        ))}
      </div>
      {parsed?.mode === 'single' && (
        <div className="recolor-preview">
          <span className="recolor-swatch" style={{ background: parsed.hex }} aria-hidden="true" />
          <span className="hint">
            will apply <strong>{parsed.label}</strong>
          </span>
        </div>
      )}
      {parsed?.mode === 'swap' && (
        <div className="recolor-preview recolor-swaps">
          {parsed.swaps.map((s, i) => (
            <span className="recolor-swap" key={i}>
              <span className="recolor-swatch" style={{ background: s.from }} aria-hidden="true" />
              <span aria-hidden="true">→</span>
              <span className="recolor-swatch" style={{ background: s.to }} aria-hidden="true" />
            </span>
          ))}
        </div>
      )}
      <button className="submit" onClick={run} disabled={busy || !prompt.trim()}>
        {busy ? 'Recoloring…' : scope ? `🎨 Recolor ${scopeName}` : '🎨 Recolor (keep shape)'}
      </button>
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
