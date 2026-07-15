import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

const POLL_INTERVAL_MS = 2000
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELED']

// Bearer header for the signed-in user (empty when logged out). Real (keyed)
// generation is gated on a user + wallet, so these POSTs must carry the token.
const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

/**
 * Generation-task lifecycle: POST to an endpoint that answers { taskId, mock },
 * then poll GET /api/generate/:taskId until terminal. onModelReady(modelUrl)
 * fires once per task; polling survives up to 3 consecutive failures.
 */
export default function useGenerationTask(onModelReady) {
  const [task, setTask] = useState(null) // { id, status, progress, mock }
  const [error, setError] = useState(null)
  const onModelReadyRef = useRef(onModelReady)
  onModelReadyRef.current = onModelReady
  // the auth token, kept in a ref so the poll effect's refine handoff always
  // reads the current value without re-subscribing the interval
  const { token } = useAuth()
  const tokenRef = useRef(token)
  tokenRef.current = token
  const notifiedRef = useRef(null)
  const pollFailsRef = useRef(0)
  // two-stage support: { refine, model, prompt }; refinedRef guards the handoff
  const optsRef = useRef({})
  const refinedRef = useRef(false)

  const generating = !!task && !TERMINAL.includes(task.status)

  const start = async (endpoint, body, options = {}) => {
    setError(null)
    optsRef.current = options
    refinedRef.current = false
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(tokenRef.current) },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      pollFailsRef.current = 0
      setTask({ id: data.taskId, status: 'PENDING', progress: 0, mock: data.mock })
      return data
    } catch (err) {
      setTask(null)
      setError(err.message)
      return null
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

        pollFailsRef.current = 0
        setTask((t) =>
          t && t.id === data.taskId
            ? { ...t, status: data.status, progress: data.progress }
            : t,
        )

        if (data.status === 'SUCCEEDED') {
          // preview done + textures requested → kick off the refine stage and
          // switch polling to the new task; the final model fires onModelReady
          if (optsRef.current.refine && !refinedRef.current) {
            refinedRef.current = true
            try {
              const r = await fetch('/api/generate/refine', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders(tokenRef.current) },
                body: JSON.stringify({
                  previewTaskId: data.taskId,
                  model: optsRef.current.model,
                  prompt: optsRef.current.prompt,
                }),
              })
              const rd = await r.json()
              if (!r.ok) throw new Error(rd.error || `HTTP ${r.status}`)
              notifiedRef.current = null
              setTask({ id: rd.taskId, status: 'PENDING', progress: 0, mock: rd.mock })
            } catch (err) {
              setError(`Texturing failed: ${err.message}`)
            }
            return
          }
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

  return { task, error, generating, start }
}
