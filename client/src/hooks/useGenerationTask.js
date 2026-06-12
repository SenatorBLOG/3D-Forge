import { useEffect, useRef, useState } from 'react'

const POLL_INTERVAL_MS = 2000
const TERMINAL = ['SUCCEEDED', 'FAILED', 'CANCELED']

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
  const notifiedRef = useRef(null)
  const pollFailsRef = useRef(0)

  const generating = !!task && !TERMINAL.includes(task.status)

  const start = async (endpoint, body) => {
    setError(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
