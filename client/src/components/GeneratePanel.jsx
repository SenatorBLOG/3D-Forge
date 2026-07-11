import { useEffect, useRef, useState } from 'react'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

// one-click starter prompts — fast onboarding and quick demos
const QUICK_PROMPTS = ['a small dragon', 'a medieval sword', 'a sci-fi helmet', 'a wooden chair']

/**
 * Generation panel with two modes:
 *   text  — describe a model (text-to-3D)
 *   image — upload / drop / paste a reference image (image-to-3D)
 * On success hands up (modelUrl, label) so the app can track what produced the model.
 */
export default function GeneratePanel({
  onModelReady,
  disabled,
  onGeneratingChange,
  initialMode = 'text',
  initialPrompt = '',
  initialImageId = null,
  initialEngine = 'meshy',
  initialTextured = false,
  autostart = false,
}) {
  const [mode, setMode] = useState(initialMode === 'image' ? 'image' : 'text')
  const [prompt, setPrompt] = useState(initialPrompt)
  // 3D engine: 'meshy' (tiered previews + optional texturing) | 'tripo' (builds
  // a finished, already-textured model in one step — so no separate refine)
  const [engine, setEngine] = useState(initialEngine === 'tripo' ? 'tripo' : 'meshy')
  // which Meshy model to generate with: meshy-5 (cheap) or meshy-6 (prettier)
  const [aiModel, setAiModel] = useState('meshy-5')
  // add the refine (texture/color) stage after preview
  const [textured, setTextured] = useState(!!initialTextured)
  // image mode: the uploaded reference (server id) + a local preview URL
  const [image, setImage] = useState(initialImageId ? { id: initialImageId } : null)
  const [preview, setPreview] = useState(null) // object URL for instant preview
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(null)
  const [costs, setCosts] = useState(null) // { tiers: {meshy-5,meshy-6}, refine }
  const fileRef = useRef(null)
  // "Imagine" mode: generate a reference photo from a prompt, then iterate on it.
  // Each edit appends a new VERSION (parentId chain); editing an older version
  // branches instead of overwriting. `versions` is the whole family (from the
  // /versions endpoint), `currentId` the one on screen / being edited from.
  const [versions, setVersions] = useState([]) // [{ id, url, prompt, version, mime }]
  const [currentId, setCurrentId] = useState(null)
  const [genImgLoading, setGenImgLoading] = useState(false)
  const [genImgError, setGenImgError] = useState(null)
  const [genImgStub, setGenImgStub] = useState(false)
  const [editInstruction, setEditInstruction] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState(null)

  const currentImage = versions.find((v) => v.id === currentId) || null

  // token price list, so the button can show "· N tokens" before generating
  useEffect(() => {
    let cancelled = false
    fetch('/api/generate/costs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setCosts(d))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // token estimate shown on the button — Meshy only (Tripo has no key yet, so it
  // runs in mock mode and is free; the server stays the source of truth on cost)
  const estCost =
    engine === 'meshy' && costs
      ? (costs.tiers?.[aiModel] ?? costs.tiers?.['meshy-5'] ?? 0) + (textured ? costs.refine || 0 : 0)
      : null

  const submittedRef = useRef(null)
  const kindRef = useRef(null) // 'text' | 'image' — how the current task was made
  const { task, error, generating, start } = useGenerationTask((url) =>
    onModelReady(url, submittedRef.current, kindRef.current),
  )

  const onGeneratingChangeRef = useRef(onGeneratingChange)
  onGeneratingChangeRef.current = onGeneratingChange
  useEffect(() => {
    onGeneratingChangeRef.current?.(generating)
  }, [generating])

  // revoke the last preview object URL when it changes / on unmount
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  // hand-off from the homepage console: kick the generation once on mount using
  // the deep-linked prompt / imageId (payload built directly so we don't race state)
  const didAutostart = useRef(false)
  useEffect(() => {
    if (didAutostart.current || !autostart) return
    didAutostart.current = true
    // texturing is a Meshy-only second stage; Tripo builds it in one step
    const refine = engine === 'meshy' && textured
    if (initialMode === 'image' && initialImageId) {
      submittedRef.current = 'image → 3D'
      kindRef.current = 'image'
      start(
        '/api/generate',
        { mode: 'image', imageId: initialImageId, model: aiModel, engine },
        { refine, model: aiModel, prompt: 'image → 3D' },
      )
    } else if (initialPrompt.trim()) {
      const trimmed = initialPrompt.trim()
      submittedRef.current = trimmed
      kindRef.current = 'text'
      start(
        '/api/generate',
        { prompt: trimmed, model: aiModel, engine },
        { refine, model: aiModel, prompt: trimmed },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart])

  const busy = generating || disabled

  const uploadImage = async (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      setImgError('Please choose a PNG, JPEG, GIF or WEBP image')
      return
    }
    setUploading(true)
    setImgError(null)
    try {
      const res = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setImage(data.image)
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
    } catch (e) {
      setImgError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) uploadImage(f)
  }
  const onDrop = (e) => {
    e.preventDefault()
    if (busy) return
    const f = e.dataTransfer.files?.[0]
    if (f) uploadImage(f)
  }
  const onPaste = (e) => {
    if (busy) return
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (item) uploadImage(item.getAsFile())
  }

  const appendSpeech = (text) =>
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))

  // texturing only applies to Meshy (Tripo outputs a finished textured model)
  const wantsRefine = engine === 'meshy' && textured
  const startText = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    submittedRef.current = trimmed
    kindRef.current = 'text'
    start(
      '/api/generate',
      { prompt: trimmed, model: aiModel, engine },
      { refine: wantsRefine, model: aiModel, prompt: trimmed },
    )
  }
  const startImage = () => {
    if (!image) return
    submittedRef.current = 'image → 3D'
    kindRef.current = 'image'
    start(
      '/api/generate',
      { mode: 'image', imageId: image.id, model: aiModel, engine },
      { refine: wantsRefine, model: aiModel, prompt: 'image → 3D' },
    )
  }

  // load the whole version family for an image and focus it (used after a
  // generate or an edit so the cards + numbering stay authoritative)
  const loadVersions = async (id) => {
    const res = await fetch(`/api/images/${encodeURIComponent(id)}/versions`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    setVersions(data.versions)
    setCurrentId(id)
  }

  // Imagine: text → reference photo (real Gemini when GEMINI_API_KEY is set,
  // SVG placeholder otherwise). Starts a fresh version family.
  const generatePhoto = async () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    setGenImgLoading(true)
    setGenImgError(null)
    setEditError(null)
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGenImgStub(!!data.stub)
      await loadVersions(data.image.id)
    } catch (e) {
      setGenImgError(e.message)
    } finally {
      setGenImgLoading(false)
    }
  }

  // Edit the CURRENT version → a new version. Editing an older version branches
  // (the server links the new image to its parentId), so nothing is overwritten.
  const applyEdit = async () => {
    const instr = editInstruction.trim()
    if (!instr || !currentId) return
    setEditing(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/images/${encodeURIComponent(currentId)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instr }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setGenImgStub(!!data.stub)
      setEditInstruction('')
      await loadVersions(data.image.id) // refresh family, focus the new version
    } catch (e) {
      setEditError(e.message)
    } finally {
      setEditing(false)
    }
  }

  // hand the current version to the image→3D flow: pick an engine, then Generate.
  const useImageForModel = () => {
    if (!currentImage) return
    setImage(currentImage)
    setPreview(null) // no object URL — the image mode falls back to currentImage.url
    setImgError(null)
    setMode('image')
  }

  const appendEditSpeech = (text) =>
    setEditInstruction((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))

  const previewSrc = preview || image?.url
  const canGenerate = mode === 'text' ? !!prompt.trim() : !!image

  return (
    <section className="panel" onPaste={mode === 'image' ? onPaste : undefined}>
      <h2>Generate</h2>

      <div className="gen-mode">
        <button
          type="button"
          className={`gen-mode-tab ${mode === 'text' ? 'active' : ''}`}
          onClick={() => setMode('text')}
          disabled={generating}
        >
          Describe
        </button>
        <button
          type="button"
          className={`gen-mode-tab ${mode === 'image' ? 'active' : ''}`}
          onClick={() => setMode('image')}
          disabled={generating}
        >
          From image
        </button>
        <button
          type="button"
          className={`gen-mode-tab ${mode === 'imagine' ? 'active' : ''}`}
          onClick={() => setMode('imagine')}
          disabled={generating}
          title="Generate a reference photo from a prompt, then turn it into 3D"
        >
          Imagine
        </button>
      </div>

      {mode === 'text' && (
        <>
          <div className="field">
            <label htmlFor="gen-prompt">Describe a model</label>
            <div className="input-with-mic">
              <textarea
                id="gen-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "a small dragon with big wings"'
                disabled={busy}
              />
              <MicButton onTranscript={appendSpeech} disabled={busy} />
            </div>
          </div>
          {!generating && (
            <div className="chips">
              {QUICK_PROMPTS.map((p) => (
                <button key={p} type="button" className="chip" onClick={() => setPrompt(p)} disabled={disabled}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'imagine' && (
        <>
          <div className="field">
            <label htmlFor="gen-imagine">Describe the image</label>
            <div className="input-with-mic">
              <textarea
                id="gen-imagine"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g. "a red sports car, studio lighting"'
                disabled={genImgLoading || disabled}
              />
              <MicButton onTranscript={appendSpeech} disabled={genImgLoading || disabled} />
            </div>
          </div>
          <button
            className="submit gen-go"
            onClick={generatePhoto}
            disabled={genImgLoading || disabled || !prompt.trim()}
          >
            {genImgLoading ? 'Generating image…' : versions.length ? 'Generate new image' : 'Generate image'}
          </button>
          {genImgError && <span className="url-error">{genImgError}</span>}

          {currentImage && (
            <div className="field">
              <label>Image versions</label>
              <div className="image-lab">
                <div className="image-lab-main">
                  <div className="image-drop has-image">
                    <img
                      className="image-drop-preview"
                      src={currentImage.url}
                      alt={currentImage.prompt || `version ${currentImage.version}`}
                    />
                  </div>
                  {genImgStub && (
                    <span className="hint">
                      preview placeholder — set GEMINI_API_KEY on the server for real images
                    </span>
                  )}
                  <div className="input-with-mic">
                    <textarea
                      className="point-prompt"
                      rows={2}
                      value={editInstruction}
                      onChange={(e) => setEditInstruction(e.target.value)}
                      placeholder={`Edit V${currentImage.version} — e.g. "make it red", "add a spoiler"`}
                      disabled={editing || disabled}
                    />
                    <MicButton onTranscript={appendEditSpeech} disabled={editing || disabled} />
                  </div>
                  <button
                    className="submit"
                    onClick={applyEdit}
                    disabled={editing || disabled || !editInstruction.trim()}
                  >
                    {editing ? 'Editing…' : `Apply edit → new version`}
                  </button>
                  {editError && <span className="url-error">{editError}</span>}
                  <button className="submit" onClick={useImageForModel} disabled={disabled}>
                    Use V{currentImage.version} → 3D
                  </button>
                </div>
                <div className="image-lab-versions">
                  {versions.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className={`version-card ${v.id === currentId ? 'active' : ''}`}
                      onClick={() => {
                        setCurrentId(v.id)
                        setGenImgStub((v.mime || '').includes('svg'))
                        setEditError(null)
                      }}
                      title={v.prompt || `version ${v.version}`}
                    >
                      <img src={v.url} alt={`V${v.version}`} />
                      <span className="version-tag">V{v.version}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'image' && (
        <div className="field">
          <label>Reference image</label>
          <div
            className={`image-drop ${previewSrc ? 'has-image' : ''}`}
            onClick={() => !busy && fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            role="button"
            tabIndex={0}
          >
            {previewSrc ? (
              <img className="image-drop-preview" src={previewSrc} alt="reference" />
            ) : (
              <div className="image-drop-empty">
                <strong>Click, drop, or paste an image</strong>
                <span className="hint">PNG · JPEG · GIF · WEBP</span>
              </div>
            )}
            {uploading && <div className="image-drop-busy">Uploading…</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {previewSrc && !busy && (
            <button className="link-button" onClick={() => fileRef.current?.click()}>
              Change image
            </button>
          )}
          {imgError && <span className="url-error">{imgError}</span>}
        </div>
      )}

      {mode !== 'imagine' && (
      <>
      <div className="model-select">
        <span className="model-label">Engine</span>
        <button
          type="button"
          className={`chip ${engine === 'meshy' ? 'chip--on' : ''}`}
          onClick={() => setEngine('meshy')}
          disabled={busy}
          title="Meshy — tiered previews, optional texturing stage"
        >
          Meshy
        </button>
        <button
          type="button"
          className={`chip ${engine === 'tripo' ? 'chip--on' : ''}`}
          onClick={() => setEngine('tripo')}
          disabled={busy}
          title="Tripo — builds a finished, already-textured model in one step"
        >
          Tripo
        </button>
      </div>
      {engine === 'meshy' && (
        <div className="model-select">
          <span className="model-label">Model</span>
          <button
            type="button"
            className={`chip ${aiModel === 'meshy-5' ? 'chip--on' : ''}`}
            onClick={() => setAiModel('meshy-5')}
            disabled={busy}
            title="Meshy-5 — faster, lower token cost"
          >
            M5 · Fast{costs ? ` · ${costs.tiers?.['meshy-5']}` : ''}
          </button>
          <button
            type="button"
            className={`chip ${aiModel === 'meshy-6' ? 'chip--on' : ''}`}
            onClick={() => setAiModel('meshy-6')}
            disabled={busy}
            title="Meshy-6 — highest quality"
          >
            M6 · Quality{costs ? ` · ${costs.tiers?.['meshy-6']}` : ''}
          </button>
        </div>
      )}
      <label className={`toggle ${engine === 'tripo' ? 'toggle--disabled' : ''}`}>
        <input
          type="checkbox"
          checked={engine === 'meshy' && textured}
          onChange={(e) => setTextured(e.target.checked)}
          disabled={busy || engine === 'tripo'}
        />
        Add textures (color){' '}
        <span className="hint">
          {engine === 'tripo'
            ? '(Tripo builds a textured model in one step)'
            : textured
              ? `(+${costs?.refine ?? 20} tokens, colored)`
              : '(off — gray preview)'}
        </span>
      </label>
      <button
        className="submit gen-go"
        onClick={mode === 'text' ? startText : startImage}
        disabled={generating || disabled || !canGenerate}
      >
        {generating ? (
          `Generating… ${task.progress}%`
        ) : (
          <>
            {mode === 'image' ? 'Generate 3D from image' : 'Generate 3D model'}
            {estCost != null && <span className="gen-cost">{estCost} ⛁</span>}
          </>
        )}
      </button>
      {generating && (
        <div className="progress" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
      )}
      {generating && task.mock && (
        <span className="hint">
          mock mode — set {engine === 'tripo' ? 'TRIPO_API_KEY' : 'MESHY_API_KEY'} on the server for real
          generation
        </span>
      )}
      </>
      )}
      </>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
