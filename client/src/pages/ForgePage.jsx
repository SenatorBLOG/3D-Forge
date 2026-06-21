import { useEffect, useRef, useState } from 'react'
import ModelViewer from '../components/ModelViewer.jsx'
import GeneratePanel from '../components/GeneratePanel.jsx'
import HistoryPanel from '../components/HistoryPanel.jsx'
import CompareView from '../components/CompareView.jsx'
import useGenerationTask from '../hooks/useGenerationTask.js'

const DEFAULT_MODEL_URL = '/models/robotic_hand.glb'

/** The forging tool: generate, click-select regions, edit, history, compare. */
export default function ForgePage() {
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL)
  const [modelStatus, setModelStatus] = useState('loading') // loading | ready | error
  const [modelError, setModelError] = useState(null)
  // text description that produced the current model — context for edits
  const [baseModelPrompt, setBaseModelPrompt] = useState(null)
  // selected points on the mesh: [{ point: {x,y,z}, meshName }]
  const [points, setPoints] = useState([])
  const [instruction, setInstruction] = useState('')
  // spatial = M3 engine (clicks + region + base); plain = bare instruction (M5
  // comparison control)
  const [spatialGrounding, setSpatialGrounding] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState(null)
  const [loadKey, setLoadKey] = useState(0)
  const objectUrlRef = useRef(null)
  const pendingEditPromptRef = useRef(null)
  const [lastEditPrompt, setLastEditPrompt] = useState(null) // { text, refinedBy }
  const [genBusy, setGenBusy] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [compare, setCompare] = useState(null)

  const swapModel = (url, { isObjectUrl = false } = {}) => {
    const stale = objectUrlRef.current
    if (stale && stale !== url) {
      // defer revocation: the old viewer must unmount first (its `disposed`
      // flag then neutralizes loader callbacks), otherwise an in-flight load
      // of the revoked URL could error into the NEW viewer's status
      setTimeout(() => URL.revokeObjectURL(stale), 0)
      objectUrlRef.current = null
    }
    if (isObjectUrl) objectUrlRef.current = url
    setPoints([])
    setModelError(null)
    setModelStatus('loading')
    setModelUrl(url)
    setLoadKey((k) => k + 1)
  }

  const editTask = useGenerationTask((url) => {
    swapModel(url)
    setBaseModelPrompt(pendingEditPromptRef.current)
    setInstruction('')
  })

  const busy = genBusy || editTask.generating
  const busySeenRef = useRef(false)
  useEffect(() => {
    if (!busySeenRef.current) {
      busySeenRef.current = true
      return
    }
    setHistoryKey((k) => k + 1)
  }, [busy])

  const addPoint = (p) => setPoints((prev) => [...prev, p])
  const removePoint = (i) => setPoints((prev) => prev.filter((_, idx) => idx !== i))

  // the mode-independent edit payload: a representative centroid of the selected
  // points (for the M3 engine), the raw points, and the joined region names
  const buildEditBase = () => {
    const n = points.length
    const centroid = points.reduce(
      (acc, p) => ({
        x: acc.x + p.point.x / n,
        y: acc.y + p.point.y / n,
        z: acc.z + p.point.z / n,
      }),
      { x: 0, y: 0, z: 0 },
    )
    return {
      instruction: instruction.trim(),
      point: centroid,
      points: points.map((p) => p.point),
      regionLabel: [...new Set(points.map((p) => p.meshName))].join(', '),
      baseModel: { prompt: baseModelPrompt, modelUrl },
    }
  }

  const sendEdit = async () => {
    if (points.length === 0 || !instruction.trim()) return
    const data = await editTask.start('/api/edit', {
      ...buildEditBase(),
      mode: spatialGrounding ? 'spatial' : 'plain',
    })
    if (data) {
      pendingEditPromptRef.current = data.prompt
      setLastEditPrompt({ text: data.prompt, refinedBy: data.refinedBy })
    }
  }

  const startCompare = () => {
    if (points.length === 0 || !instruction.trim()) return
    setCompare(buildEditBase())
  }

  const onFileChosen = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file
    if (!file) return
    setBaseModelPrompt(null)
    setLastEditPrompt(null)
    swapModel(URL.createObjectURL(file), { isObjectUrl: true })
  }

  const loadFromUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      setUrlError('Enter an http(s) link to a .glb file')
      return
    }
    setUrlError(null)
    setBaseModelPrompt(null)
    setLastEditPrompt(null)
    swapModel(url)
  }

  return (
    <main className="app-main">
      <div className="viewer-wrap">
        <button
          className="panel-toggle panel-toggle--float"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          aria-label={sidebarOpen ? 'Hide panel' : 'Show panel'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <line x1="15" y1="4" x2="15" y2="20" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        {compare ? (
          <CompareView params={compare} onClose={() => setCompare(null)} />
        ) : (
          <>
            {modelStatus === 'loading' && (
              <div className="viewer-overlay">Loading model…</div>
            )}
            {modelStatus === 'error' && (
              <div className="viewer-overlay viewer-overlay-error">{modelError}</div>
            )}
            <ModelViewer
              key={`${modelUrl}#${loadKey}`}
              modelUrl={modelUrl}
              points={points}
              onAddPoint={addPoint}
              onLoaded={() => setModelStatus('ready')}
              onError={(message) => {
                setModelError(message)
                setModelStatus('error')
              }}
            />
            {modelStatus === 'ready' && points.length === 0 && (
              <div className="viewer-hint">Click the model to add points</div>
            )}
          </>
        )}
      </div>
      <aside className={`sidebar ${sidebarOpen ? '' : 'sidebar--collapsed'}`}>
        <GeneratePanel
          disabled={editTask.generating}
          onGeneratingChange={setGenBusy}
          onModelReady={(url, prompt) => {
            setBaseModelPrompt(prompt)
            setLastEditPrompt(null)
            swapModel(url)
          }}
        />
        <section className="panel">
          <h2>Model</h2>
          <label className="file-button">
            Upload .glb
            <input type="file" accept=".glb" hidden onChange={onFileChosen} />
          </label>
          <div className="url-row">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                setUrlError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && loadFromUrl()}
              placeholder="https://example.com/model.glb"
            />
            <button onClick={loadFromUrl} disabled={!urlInput.trim()}>
              Load
            </button>
          </div>
          {urlError && <span className="url-error">{urlError}</span>}
          {modelUrl !== DEFAULT_MODEL_URL && (
            <button
              className="link-button"
              onClick={() => {
                setBaseModelPrompt(null)
                setLastEditPrompt(null)
                swapModel(DEFAULT_MODEL_URL)
              }}
            >
              ← Back to default model
            </button>
          )}
        </section>
        <section className="panel">
          <h2>Spatial prompt</h2>
          <div className="field">
            <label>Selected points ({points.length})</label>
            {points.length === 0 ? (
              <code>click the model to add one or more points</code>
            ) : (
              <div className="point-list">
                {points.map((p, i) => (
                  <div className="point-row" key={i}>
                    <span className="point-region" title={p.meshName}>
                      {p.meshName}
                    </span>
                    <code>
                      {p.point.x.toFixed(2)}, {p.point.y.toFixed(2)},{' '}
                      {p.point.z.toFixed(2)}
                    </code>
                    <button
                      className="point-remove"
                      onClick={() => removePoint(i)}
                      aria-label="Remove point"
                      title="Remove point"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {points.length > 0 && (
              <button className="link-button" onClick={() => setPoints([])}>
                Clear all points
              </button>
            )}
          </div>
          <div className="field">
            <label htmlFor="instruction">Instruction</label>
            <textarea
              id="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder='e.g. "make this finger longer"'
              rows={4}
            />
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={spatialGrounding}
              onChange={(e) => setSpatialGrounding(e.target.checked)}
            />
            Spatial grounding{' '}
            <span className="hint">
              ({spatialGrounding ? 'clicks + region' : 'plain instruction'})
            </span>
          </label>
          <button
            className="submit"
            onClick={sendEdit}
            disabled={
              points.length === 0 || !instruction.trim() || editTask.generating || genBusy
            }
          >
            {editTask.generating
              ? `Applying edit… ${editTask.task.progress}%`
              : 'Send edit'}
          </button>
          <button
            className="ghost-button"
            onClick={startCompare}
            disabled={points.length === 0 || !instruction.trim() || busy}
            title="Run this edit both ways and compare the results"
          >
            Compare spatial vs plain
          </button>
          {editTask.generating && (
            <div className="progress" aria-hidden="true">
              <div
                className="progress-fill"
                style={{ width: `${editTask.task.progress}%` }}
              />
            </div>
          )}
          {editTask.generating && editTask.task.mock && (
            <span className="hint">
              mock mode — set MESHY_API_KEY on the server for real generation
            </span>
          )}
          {editTask.error && <span className="url-error">{editTask.error}</span>}
          {lastEditPrompt && (
            <div className="field">
              <label>Prompt sent ({lastEditPrompt.refinedBy})</label>
              <code className="prompt-preview">{lastEditPrompt.text}</code>
            </div>
          )}
        </section>
        <HistoryPanel
          refreshKey={historyKey}
          busy={busy}
          onLoad={(entry) => {
            setBaseModelPrompt(entry.prompt ?? null)
            setLastEditPrompt(null)
            swapModel(entry.modelUrl)
          }}
        />
      </aside>
    </main>
  )
}
