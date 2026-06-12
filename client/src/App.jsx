import { useRef, useState } from 'react'
import ModelViewer from './components/ModelViewer.jsx'
import GeneratePanel from './components/GeneratePanel.jsx'

const DEFAULT_MODEL_URL = '/models/robotic_hand.glb'

export default function App() {
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL)
  const [modelStatus, setModelStatus] = useState('loading') // loading | ready | error
  const [modelError, setModelError] = useState(null)
  const [selection, setSelection] = useState(null) // { point, meshName }
  const [instruction, setInstruction] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState(null)
  // bumped on every swap so re-loading the SAME url (e.g. retry after an
  // error) still remounts the viewer instead of silently doing nothing
  const [loadKey, setLoadKey] = useState(0)
  // object URL of the last uploaded file — revoked when replaced
  const objectUrlRef = useRef(null)

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
    setSelection(null)
    setModelError(null)
    setModelStatus('loading')
    setModelUrl(url)
    setLoadKey((k) => k + 1)
  }

  const onFileChosen = (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file
    if (!file) return
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
    swapModel(url)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>3D Forge</h1>
        <span className="tagline">
          Click the model to select a region, then describe your edit
        </span>
      </header>
      <main className="app-main">
        <div className="viewer-wrap">
          {modelStatus === 'loading' && (
            <div className="viewer-overlay">Loading model…</div>
          )}
          {modelStatus === 'error' && (
            <div className="viewer-overlay viewer-overlay-error">
              {modelError}
            </div>
          )}
          <ModelViewer
            key={`${modelUrl}#${loadKey}`}
            modelUrl={modelUrl}
            onSelect={setSelection}
            onLoaded={() => setModelStatus('ready')}
            onError={(message) => {
              setModelError(message)
              setModelStatus('error')
            }}
          />
        </div>
        <aside className="sidebar">
          <GeneratePanel onModelReady={(url) => swapModel(url)} />
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
                onClick={() => swapModel(DEFAULT_MODEL_URL)}
              >
                ← Back to default model
              </button>
            )}
          </section>
          <section className="panel">
            <h2>Spatial prompt</h2>
            <div className="field">
              <label>Region</label>
              <code>{selection ? selection.meshName : 'nothing selected yet'}</code>
            </div>
            <div className="field">
              <label>Selected point</label>
              <code>
                {selection
                  ? `x: ${selection.point.x.toFixed(3)}  y: ${selection.point.y.toFixed(3)}  z: ${selection.point.z.toFixed(3)}`
                  : '—'}
              </code>
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
            <button
              className="submit"
              disabled={!selection || !instruction.trim()}
              title="Wired up in milestone M3 (Spatial Prompt Engine)"
            >
              Send edit — coming in M3
            </button>
          </section>
        </aside>
      </main>
    </div>
  )
}
