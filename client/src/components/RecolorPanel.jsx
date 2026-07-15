import { useState } from 'react'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

/**
 * P2 — surface edit (recolor / re-material) of the CURRENT model without changing
 * its geometry (Tripo texture_model). No reshape, no drift — the mesh stays exactly
 * the same, only the texture changes. Result lands as a new model version.
 * Mock-safe (no TRIPO_API_KEY → mock model, free).
 */
export default function RecolorPanel({ modelUrl, onModelReady3D }) {
  const [prompt, setPrompt] = useState('')
  const task = useGenerationTask((url) => onModelReady3D?.(url, prompt ? `Recolor: ${prompt}` : 'Recolor'))

  const run = () => {
    const p = prompt.trim()
    if (!p || task.generating) return
    task.start('/api/generate/retexture', { modelUrl, prompt: p }, { prompt: p })
  }

  const appendSpeech = (t) => setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))

  return (
    <section className="panel">
      <div className="spatial-head">
        <span className="spatial-flag">🎨 Surface</span>
        <h2>Recolor</h2>
      </div>
      <p className="spatial-blurb">
        Change color or material by prompt — the shape stays exactly the same (no reshape, no
        drift). Best for “make it red”, “gold armor”, “matte black”.
      </p>
      <div className="input-with-mic">
        <textarea
          className="point-prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "make it deep red with gold trim"'
          disabled={task.generating}
        />
        <MicButton onTranscript={appendSpeech} disabled={task.generating} />
      </div>
      <button className="submit" onClick={run} disabled={task.generating || !prompt.trim()}>
        {task.generating ? `Recoloring… ${task.task.progress}%` : '🎨 Recolor (keep shape)'}
      </button>
      {task.generating && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${task.task.progress}%` }} />
        </div>
      )}
      {task.generating && task.task.mock && (
        <span className="hint">mock mode — set TRIPO_API_KEY for a real recolor</span>
      )}
      {task.error && <span className="url-error">{task.error}</span>}
    </section>
  )
}
