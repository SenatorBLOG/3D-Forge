import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import GeneratePanel from '../components/GeneratePanel.jsx'
import HistoryPanel from '../components/HistoryPanel.jsx'
import CompareView from '../components/CompareView.jsx'
import PublishPanel from '../components/PublishPanel.jsx'
import MicButton from '../components/MicButton.jsx'
import useGenerationTask from '../hooks/useGenerationTask.js'

const SAMPLE_MODEL_URL = '/models/robotic_hand.glb'
const isLoadableUrl = (u) => typeof u === 'string' && /^(https?:\/\/|\/)/.test(u)

/** The forging tool: generate, click-select regions, edit, history, compare. */
export default function ForgePage() {
  const [searchParams] = useSearchParams()
  // deep-link from Explore: /forge?model=<url> opens that model. Otherwise the
  // canvas starts EMPTY — the create surface, not a pre-loaded hand.
  const [modelUrl, setModelUrl] = useState(() => {
    const m = searchParams.get('model')
    return isLoadableUrl(m) ? m : null
  })
  const [modelStatus, setModelStatus] = useState(() =>
    isLoadableUrl(searchParams.get('model')) ? 'loading' : 'idle',
  ) // idle | loading | ready | error
  const [modelError, setModelError] = useState(null)
  // text description that produced the current model — context for edits
  const [baseModelPrompt, setBaseModelPrompt] = useState(null)
  // selected points on the mesh: [{ point: {x,y,z}, meshName, prompt }]
  const [points, setPoints] = useState([])
  // which point's inline editor is open (index, or null) — shared by the model
  // overlay and the sidebar so the two stay in sync
  const [selectedIndex, setSelectedIndex] = useState(null)
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
  // an uploaded file being previewed but not yet saved to History (explicit Save)
  const [pendingFile, setPendingFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
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
    // any model switch discards an unsaved upload preview (re-set by onFileChosen)
    setPendingFile(null)
    setPoints([])
    setSelectedIndex(null)
    setModelError(null)
    setModelStatus('loading')
    setModelUrl(url)
    setLoadKey((k) => k + 1)
  }

  const editTask = useGenerationTask((url) => {
    swapModel(url) // clears points + selection
    setBaseModelPrompt(pendingEditPromptRef.current)
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

  // stable per-point id so React keys by identity (not array index) — survives
  // removing a middle point without focus/value jumping between rows
  const pointIdRef = useRef(0)
  const justAddedRef = useRef(false)

  // a click on the mesh adds a point and opens its prompt editor right away
  const addPoint = (p) => {
    justAddedRef.current = true
    setPoints((prev) => [...prev, { ...p, id: pointIdRef.current++, prompt: '' }])
  }
  // select the new point once the add has committed (avoids reading a stale
  // points.length from the click closure)
  useEffect(() => {
    if (!justAddedRef.current) return
    justAddedRef.current = false
    setSelectedIndex(points.length - 1)
  }, [points])
  const removePoint = (i) => {
    setPoints((prev) => prev.filter((_, idx) => idx !== i))
    setSelectedIndex(null)
  }
  const setPointPrompt = (i, value) =>
    setPoints((prev) => prev.map((p, idx) => (idx === i ? { ...p, prompt: value } : p)))
  const clearPoints = () => {
    setPoints([])
    setSelectedIndex(null)
  }

  // at least one point with a prompt is required to edit
  const hasPrompts = points.some((p) => (p.prompt || '').trim())

  // the mode-independent edit payload: a representative centroid of the selected
  // points (for the M3 engine), the raw points, and a region-annotated
  // instruction composed from each point's own prompt
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
    const instruction = points
      .filter((p) => (p.prompt || '').trim())
      .map((p) => `${p.meshName}: ${p.prompt.trim()}`)
      .join('; ')
    return {
      instruction,
      point: centroid,
      points: points.map((p) => p.point),
      regionLabel: [...new Set(points.map((p) => p.meshName))].join(', '),
      baseModel: { prompt: baseModelPrompt, modelUrl },
    }
  }

  const sendEdit = async () => {
    if (!hasPrompts) return
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
    if (!hasPrompts) return
    setCompare(buildEditBase())
  }

  // upload = preview only (view-only object URL); History gets nothing until the
  // user explicitly clicks "Save to History" (keeps History uncluttered)
  const onFileChosen = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file
    if (!file) return
    setBaseModelPrompt(null)
    setLastEditPrompt(null)
    swapModel(URL.createObjectURL(file), { isObjectUrl: true }) // clears pendingFile
    setPendingFile(file) // mark as previewed-but-unsaved
  }

  // explicit save: store the previewed upload on the server + add to History
  const saveUpload = async () => {
    if (!pendingFile || saving) return
    setSaving(true)
    try {
      const name = pendingFile.name.replace(/\.glb$/i, '')
      const res = await fetch(`/api/models/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pendingFile,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      swapModel(data.url) // switch to the stored URL + clear pendingFile
      setHistoryKey((k) => k + 1) // refresh History to show the new card
    } catch (err) {
      setModelError(`Couldn't save the model: ${err.message}`)
      setModelStatus('error')
    } finally {
      setSaving(false)
    }
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

  // load the bundled demo model on demand (no longer auto-loaded)
  const loadSample = () => {
    setBaseModelPrompt(null)
    setLastEditPrompt(null)
    swapModel(SAMPLE_MODEL_URL)
  }

  // return the canvas to its empty create-first state
  const clearModel = () => {
    const stale = objectUrlRef.current
    if (stale) {
      setTimeout(() => URL.revokeObjectURL(stale), 0)
      objectUrlRef.current = null
    }
    setPendingFile(null)
    setPoints([])
    setSelectedIndex(null)
    setModelError(null)
    setBaseModelPrompt(null)
    setLastEditPrompt(null)
    setModelStatus('idle')
    setModelUrl(null)
    setLoadKey((k) => k + 1)
  }

  return (
    <main className="app-main forge">
      {/* LEFT — create input + options */}
      <aside className="sidebar forge-rail">
        <GeneratePanel
          disabled={editTask.generating}
          initialMode={searchParams.get('mode') === 'image' ? 'image' : 'text'}
          initialPrompt={searchParams.get('prompt') || ''}
          initialImageId={searchParams.get('imageId') || null}
          autostart={searchParams.get('autostart') === '1'}
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
          {pendingFile && (
            <>
              <span className="hint">
                Previewing “{pendingFile.name}” — not saved yet.
              </span>
              <button className="submit" onClick={saveUpload} disabled={saving}>
                {saving ? 'Saving…' : 'Save to History'}
              </button>
            </>
          )}
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
          {modelUrl !== SAMPLE_MODEL_URL && (
            <button className="link-button" onClick={loadSample}>
              Load a sample model
            </button>
          )}
          {modelUrl && (
            <button className="link-button" onClick={clearModel}>
              ✕ Clear canvas
            </button>
          )}
        </section>
        {modelUrl && (
        <section className="panel">
          <h2>Spatial prompt</h2>
          <div className="field">
            <label>Selected points ({points.length})</label>
            {points.length === 0 ? (
              <code>click the model to add a point, then describe its change</code>
            ) : (
              <div className="point-list">
                {points.map((p, i) => (
                  <div
                    className={`point-item ${i === selectedIndex ? 'active' : ''}`}
                    key={p.id}
                  >
                    <div className="point-item-head">
                      <button
                        type="button"
                        className="point-badge"
                        onClick={() => setSelectedIndex(i === selectedIndex ? null : i)}
                        title="Focus this point on the model"
                      >
                        {i + 1}
                      </button>
                      <span className="point-region" title={p.meshName}>
                        {p.meshName}
                      </span>
                      <button
                        className="point-remove"
                        onClick={() => removePoint(i)}
                        aria-label="Remove point"
                        title="Remove point"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="input-with-mic">
                      <textarea
                        className="point-prompt"
                        value={p.prompt || ''}
                        onChange={(e) => setPointPrompt(i, e.target.value)}
                        onFocus={() => setSelectedIndex(i)}
                        placeholder={`Prompt for point ${i + 1} — e.g. "make this finger longer"`}
                        rows={2}
                      />
                      <MicButton
                        onTranscript={(text) => {
                          const cur = p.prompt || ''
                          setPointPrompt(i, cur.trim() ? `${cur.trim()} ${text}` : text)
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {points.length > 0 && (
              <button className="link-button" onClick={clearPoints}>
                Clear all points
              </button>
            )}
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
            disabled={!hasPrompts || editTask.generating || genBusy}
          >
            {editTask.generating
              ? `Applying edit… ${editTask.task.progress}%`
              : 'Send edit'}
          </button>
          <button
            className="ghost-button"
            onClick={startCompare}
            disabled={!hasPrompts || busy}
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
        )}
      </aside>

      {/* CENTER — canvas, or the create-first surface when empty */}
      <div className="viewer-wrap">
        {compare ? (
          <CompareView params={compare} onClose={() => setCompare(null)} />
        ) : modelUrl ? (
          <>
            {modelStatus === 'loading' && <div className="viewer-overlay">Loading model…</div>}
            {modelStatus === 'error' && (
              <div className="viewer-overlay viewer-overlay-error">{modelError}</div>
            )}
            <ModelViewer
              key={`${modelUrl}#${loadKey}`}
              modelUrl={modelUrl}
              points={points}
              onAddPoint={addPoint}
              selectedIndex={selectedIndex}
              onSelectPoint={setSelectedIndex}
              onPromptChange={setPointPrompt}
              onLoaded={() => setModelStatus('ready')}
              onError={(message) => {
                setModelError(message)
                setModelStatus('error')
              }}
            />
            {modelStatus === 'ready' && points.length === 0 && (
              <div className="viewer-hint">Click the model to add a point</div>
            )}
          </>
        ) : busy ? (
          <div className="forge-empty">
            <div className="forge-empty-spinner" />
            <h2>Forging your model…</h2>
            <p>Hang tight — this runs in the panel on the left.</p>
          </div>
        ) : (
          <div className="forge-empty">
            <div className="forge-empty-glyph">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.3">
                <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" strokeLinejoin="round" />
                <path d="M3 7l9 4.5L21 7M12 11.5V21.5" strokeLinejoin="round" />
              </svg>
            </div>
            <h2>Your model appears here</h2>
            <p>
              Describe it or drop an image in the panel on the left, then hit{' '}
              <span className="forge-empty-accent">Generate</span>.
            </p>
            <button className="ghost-button" onClick={loadSample}>
              Load a sample model
            </button>
          </div>
        )}
      </div>

      {/* RIGHT — library + publish */}
      <aside className="sidebar forge-library">
        {modelUrl && <PublishPanel modelUrl={modelUrl} description={baseModelPrompt} />}
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
