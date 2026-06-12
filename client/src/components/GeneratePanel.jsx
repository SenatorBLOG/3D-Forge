import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 2000
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELED']

/**
 * Text-to-3D generation panel. Sends the prompt to POST /api/generate, polls
 * GET /api/generate/:taskId for progress, and hands the resulting GLB url up
 * via onModelReady once the task succeeds.
 */
export default function GeneratePanel({ onModelReady }) {
  const [prompt, setPrompt] = useState('')
  const [task, setTask] = useState(null) // { id, status, progress, mock }
  const [error, setError] = useState(null)
  const onModelReadyRef = useRef(onModelReady)
  onModelReadyRef.current = onModelReady
  // last task id already handed to the viewer — guards double notification
  const notifiedRef = useRef(null)
  // consecutive poll failures — one network blip must not orphan a live
  // (credit-spending) generation, so we only give up after a few in a row
  const pollFailsRef = useRef(0)

  const generating = !!task && !TERMINAL.includes(task.status)

  const start = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      pollFailsRef.current = 0
      setTask({ id: data.taskId, status: 'PENDING', progress: 0, mock: data.mock })
    } catch (err) {
      setTask(null)
      setError(err.message)
    }
  }

  useEffect(() => {
    if (!task?.id || TERMINAL.includes(task.status)) return
    let cancelled = false

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/${encodeURIComponent(task.id)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

        setTask((t) =>
          t && t.id === data.taskId
            ? { ...t, status: data.status, progress: data.progress }
            : t,
        )

        pollFailsRef.current = 0

        if (data.status === 'SUCCEEDED') {
          if (!data.modelUrl) {
            setError('Generation finished but the service returned no model file.')
          } else if (notifiedRef.current !== data.taskId) {
            notifiedRef.current = data.taskId
            onModelReadyRef.current?.(data.modelUrl)
          }
        } else if (data.status === 'FAILED' || data.status === 'CANCELED') {
          setError('Generation failed on the AI service side — try a different prompt.')
        }
      } catch (err) {
        if (cancelled) return
        pollFailsRef.current += 1
        if (pollFailsRef.current >= 3) {
          setError(`Lost track of the generation task: ${err.message}`)
          setTask(null)
        }
        // otherwise keep polling — transient blips are expected
      }
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [task?.id, task?.status])

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
          disabled={generating}
        />
      </div>
      <button
        className="submit"
        onClick={start}
        disabled={generating || !prompt.trim()}
      >
        {generating ? `Generating… ${task.progress}%` : 'Generate 3D model'}
      </button>
      {generating && task.mock && (
        <span className="hint">
          mock mode — set MESHY_API_KEY on the server for real generation
        </span>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
