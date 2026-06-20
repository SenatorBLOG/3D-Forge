import { useEffect, useRef, useState } from 'react'
import ModelViewer from './ModelViewer.jsx'
import useGenerationTask from '../hooks/useGenerationTask.js'

/**
 * One side of the comparison: runs a single edit in the given mode and shows
 * its result. The two panes together answer the proposal's research question —
 * does spatial grounding beat a plain instruction for the same edit?
 */
function ComparePane({ params, mode, label, sub }) {
  const [meta, setMeta] = useState(null) // { taskId, prompt, refinedBy }
  const [evaluation, setEvaluation] = useState(null)
  const [modelUrl, setModelUrl] = useState(null)
  const { task, error, generating, start } = useGenerationTask((url) =>
    setModelUrl(url),
  )
  // fire exactly one edit on mount (StrictMode double-invoke guard)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false
    start('/api/edit', { ...params, mode }).then((data) => {
      if (!cancelled && data) {
        setMeta({ taskId: data.taskId, prompt: data.prompt, refinedBy: data.refinedBy })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rate = async (n) => {
    if (!meta) return
    try {
      const res = await fetch(`/api/dataset/${encodeURIComponent(meta.taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluation: n }),
      })
      if (res.ok) setEvaluation(n)
    } catch {
      // rating is best-effort; ignore network errors here
    }
  }

  const progress = task?.progress ?? 0

  return (
    <div className="compare-pane">
      <div className="compare-pane-head">
        <span className="compare-label">{label}</span>
        <span className="hint">{sub}</span>
      </div>
      <div className="compare-viewer">
        {modelUrl ? (
          <ModelViewer modelUrl={modelUrl} points={[]} onAddPoint={() => {}} />
        ) : (
          <div className="compare-loading">
            {error ? (
              <span className="url-error">{error}</span>
            ) : (
              <>
                <span>Forging… {progress}%</span>
                <div className="progress" aria-hidden="true">
                  <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {meta && (
        <div className="compare-foot">
          <div className="field">
            <label>Prompt sent ({meta.refinedBy})</label>
            <code className="prompt-preview">{meta.prompt}</code>
          </div>
          {modelUrl && (
            <div className="rating">
              <span>rate:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`star ${evaluation >= n ? 'on' : ''}`}
                  onClick={() => rate(n)}
                  title={`${n}/5`}
                  aria-label={`Rate ${n} of 5`}
                >
                  ★
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Side-by-side comparison of the same edit run two ways: spatial grounding
 * (M3 engine) vs a plain instruction. Backend-agnostic — two /api/edit calls.
 */
export default function CompareView({ params, onClose }) {
  return (
    <div className="compare">
      <div className="compare-bar">
        <span className="compare-title">
          Comparing edit: <strong>&ldquo;{params.instruction}&rdquo;</strong>
        </span>
        <button className="link-button" onClick={onClose}>
          ✕ Close compare
        </button>
      </div>
      <div className="compare-panes">
        <ComparePane
          params={params}
          mode="spatial"
          label="Spatial grounding"
          sub="clicks + region + base"
        />
        <ComparePane
          params={params}
          mode="plain"
          label="Plain prompt"
          sub="bare instruction"
        />
      </div>
    </div>
  )
}
