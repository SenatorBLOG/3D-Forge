import { useEffect, useRef, useState } from 'react'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

// one-click starter prompts — fast onboarding and quick demos
const QUICK_PROMPTS = ['a small dragon', 'a medieval sword', 'a sci-fi helmet', 'a wooden chair']

/**
 * Text-to-3D generation panel. On success hands up (modelUrl, promptText) so
 * the app can track what description produced the current model.
 */
export default function GeneratePanel({ onModelReady, disabled, onGeneratingChange }) {
  const [prompt, setPrompt] = useState('')
  // which Meshy model to generate with: meshy-5 (cheap, for tests) or
  // meshy-6 (prettier, more credits). Sent to the server as `model`.
  const [aiModel, setAiModel] = useState('meshy-5')
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
    start('/api/generate', { prompt: trimmed, model: aiModel })
  }

  // append a spoken phrase to whatever is already in the field
  const appendSpeech = (text) =>
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))

  return (
    <section className="panel">
      <h2>Generate</h2>
      <div className="field">
        <label htmlFor="gen-prompt">Describe a model</label>
        <div className="input-with-mic">
          <textarea
            id="gen-prompt"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "a small dragon with big wings"'
            disabled={generating || disabled}
          />
          <MicButton onTranscript={appendSpeech} disabled={generating || disabled} />
        </div>
      </div>
      {!generating && (
        <div className="chips">
          {QUICK_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              onClick={() => setPrompt(p)}
              disabled={disabled}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="model-select">
        <span className="model-label">Model</span>
        <button
          type="button"
          className={`chip ${aiModel === 'meshy-5' ? 'chip--on' : ''}`}
          onClick={() => setAiModel('meshy-5')}
          disabled={generating || disabled}
          title="Meshy-5 — cheaper (5 credits), good for tests"
        >
          M5 · cheap
        </button>
        <button
          type="button"
          className={`chip ${aiModel === 'meshy-6' ? 'chip--on' : ''}`}
          onClick={() => setAiModel('meshy-6')}
          disabled={generating || disabled}
          title="Meshy-6 — prettier (20 credits), for the demo"
        >
          M6 · pretty
        </button>
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
