import { useEffect, useRef, useState } from 'react'
import useGenerationTask from '../hooks/useGenerationTask.js'

/**
 * Text-to-3D generation panel. On success hands up (modelUrl, promptText) so
 * the app can track what description produced the current model.
 */
export default function GeneratePanel({ onModelReady, disabled, onGeneratingChange }) {
  const [prompt, setPrompt] = useState('')
  // prompt that produced the in-flight task — reported alongside the result
  const submittedRef = useRef(null)
  const { task, error, generating, start } = useGenerationTask((url) =>
    onModelReady(url, submittedRef.current),
  )

  const onGeneratingChangeRef = useRef(onGeneratingChange)
  onGeneratingChangeRef.current = onGeneratingChange
  useEffect(() => {
    onGeneratingChangeRef.current?.(generating)
  }, [generating])

  const startGeneration = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    submittedRef.current = trimmed
    start('/api/generate', { prompt: trimmed })
  }

  return (
    <section className="panel">
      <h2>Generate</h2>
      <div className="field">
        <label htmlFor="gen-prompt">Describe a model</label>
        <textarea
          id="gen-prompt"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder='e.g. "a small dragon with big wings"'
          disabled={generating || disabled}
        />
      </div>
      <button
        className="submit"
        onClick={startGeneration}
        disabled={generating || disabled || !prompt.trim()}
      >
        {generating ? `Generating… ${task.progress}%` : 'Generate 3D model'}
      </button>
      {generating && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
      )}
      {generating && task.mock && (
        <span className="hint">
          mock mode — set MESHY_API_KEY on the server for real generation
        </span>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
