import { useEffect, useRef, useState } from 'react'
import useGenerationTask from '../hooks/useGenerationTask.js'
import MicButton from './MicButton.jsx'

// one-click starter prompts — fast onboarding and quick demos
const QUICK_PROMPTS = ['a small dragon', 'a medieval sword', 'a sci-fi helmet', 'a wooden chair']

// longer phrases the empty prompt box "types out" (Meshy-style live placeholder)
const TYPE_SEEDS = [
  'a small dragon with big wings',
  'a medieval sword, ornate hilt',
  'a sci-fi helmet with a glossy visor',
  'a hand-carved wooden chair',
  'a chunky retro robot, worn paint',
]

// human-labelled quality tiers — hide the Meshy/Tripo/M5/M6 jargon behind a plain
// choice. Each maps to a real (engine, model) pair under the hood.
const MODEL_OPTIONS = [
  { id: 'fast', engine: 'meshy', model: 'meshy-5', name: 'Fast', desc: 'quick draft' },
  { id: 'detailed', engine: 'meshy', model: 'meshy-6', name: 'Detailed', desc: 'sharper mesh' },
  { id: 'colour', engine: 'tripo', model: 'meshy-5', name: 'Colour', desc: 'textured · 1-step' },
]

// 4.2b — how to ask Gemini for the extra generation-time views from the front image
const VIEW_PROMPT = {
  left: 'the exact same subject viewed from its left side (90° profile), full body, identical design, materials and colours, plain neutral background',
  back: 'the exact same subject viewed from directly behind (rear view), full body, identical design, materials and colours, plain neutral background',
  right: 'the exact same subject viewed from its right side (90° profile), full body, identical design, materials and colours, plain neutral background',
}

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
  // Tripo only: run semantic segmentation right after the model is built, so it
  // comes back already split into editable parts (like Meshy's texturing toggle)
  const [segmentOnCreate, setSegmentOnCreate] = useState(false)
  // 4.2b — how many reference views to build the model from: 1 (single image→3D,
  // cheap), 2 (front+side) or 4 (front/side/back/side). >1 synthesizes the extra
  // views from the front image via Gemini, then feeds Tripo multi-view. Tripo only.
  const [genViews, setGenViews] = useState(1)
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
  // the live "typing" text shown as the prompt placeholder while the box is empty
  const [typed, setTyped] = useState('')

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
      ? (costs.tiers?.[aiModel] ?? costs.tiers?.['meshy-5'] ?? 0) +
        (textured && mode === 'text' ? costs.refine || 0 : 0)
      : null

  const submittedRef = useRef(null)
  const kindRef = useRef(null) // 'text' | 'image' — how the current task was made
  // captured at submit time so a late toggle change can't retarget the result
  const wantsSegmentRef = useRef(false)
  const { task, error, generating, start } = useGenerationTask((url) =>
    onModelReady(url, submittedRef.current, kindRef.current, { segment: wantsSegmentRef.current }),
  )

  const onGeneratingChangeRef = useRef(onGeneratingChange)
  onGeneratingChangeRef.current = onGeneratingChange
  useEffect(() => {
    onGeneratingChangeRef.current?.(generating)
  }, [generating])

  // revoke the last preview object URL when it changes / on unmount
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  // typewriter placeholder — cycles TYPE_SEEDS while the box is empty & idle, so
  // the primary input feels alive (this is where users spend tokens). Pauses the
  // moment they start typing (prompt non-empty) and skips image mode (no textbox).
  useEffect(() => {
    if (prompt || generating || disabled || mode === 'image') return
    let seed = 0
    let ch = 0
    let dir = 1
    let timer
    const tick = () => {
      const word = TYPE_SEEDS[seed % TYPE_SEEDS.length]
      ch += dir
      setTyped(word.slice(0, ch))
      let delay = dir > 0 ? 55 : 26
      if (ch >= word.length) {
        dir = -1
        delay = 1500
      } else if (ch <= 0) {
        dir = 1
        seed += 1
        delay = 320
      }
      timer = setTimeout(tick, delay)
    }
    timer = setTimeout(tick, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, generating, disabled, mode])

  // hand-off from the homepage console: kick the generation once on mount using
  // the deep-linked prompt / imageId (payload built directly so we don't race state)
  const didAutostart = useRef(false)
  useEffect(() => {
    if (didAutostart.current || !autostart) return
    didAutostart.current = true
    // texturing is a Meshy TEXT-mode second stage; image→3D already returns a
    // PBR-textured model (and Tripo builds it in one step), so refine only here
    const refine = engine === 'meshy' && textured && initialMode !== 'image'
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

  // texturing (refine) is a Meshy TEXT-mode stage only. image→3D already comes
  // back PBR-textured, and its task can't be refined via the text endpoint
  // (Meshy 400 "Preview task not found"); Tripo textures in one step too.
  const wantsRefine = engine === 'meshy' && textured
  const startText = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    submittedRef.current = trimmed
    kindRef.current = 'text'
    wantsSegmentRef.current = engine === 'tripo' && segmentOnCreate
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
    wantsSegmentRef.current = engine === 'tripo' && segmentOnCreate
    start(
      '/api/generate',
      { mode: 'image', imageId: image.id, model: aiModel, engine },
      { refine: false, model: aiModel, prompt: 'image → 3D' }, // image→3D is already textured
    )
  }

  // Imagine → 3D: build the current image version into a model with the SAME
  // engine/segment options as the other modes. With genViews>1 (Tripo only) we
  // first synthesize the extra side/back views from the front image via Gemini,
  // then feed all of them to Tripo multi-view so the model isn't guessed from a
  // single angle. (Gemini's cross-view consistency isn't perfect — flagged in UI.)
  const startImagineTo3D = async () => {
    if (!currentImage) return
    submittedRef.current = 'image → 3D'
    kindRef.current = 'image'
    wantsSegmentRef.current = engine === 'tripo' && segmentOnCreate
    const count = engine === 'tripo' ? genViews : 1
    if (count <= 1) {
      start(
        '/api/generate',
        { mode: 'image', imageId: currentImage.id, model: aiModel, engine },
        { refine: false, model: aiModel, prompt: 'image → 3D' },
      )
      return
    }
    setGenImgError(null)
    try {
      const order = count === 2 ? ['left'] : ['left', 'back', 'right']
      const ids = [currentImage.id] // front stays slot 0
      for (const side of order) {
        const res = await fetch(`/api/images/${encodeURIComponent(currentImage.id)}/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: VIEW_PROMPT[side] }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
        ids.push(data.image.id)
      }
      start('/api/generate/multiview', { imageIds: ids }, { prompt: 'image → 3D (multi-view)' })
    } catch (e) {
      setGenImgError(e.message)
    }
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
  const canGenerate =
    mode === 'text' ? !!prompt.trim() : mode === 'imagine' ? !!currentImage : !!image

  // which quality tier is selected (maps engine+model back to a plain card)
  const activeModel = MODEL_OPTIONS.find((o) =>
    o.engine === 'tripo' ? engine === 'tripo' : engine === 'meshy' && aiModel === o.model,
  )
  const pickModel = (o) => {
    setEngine(o.engine)
    if (o.engine === 'meshy') setAiModel(o.model)
  }
  const costLabel = (o) => {
    if (o.engine === 'tripo') return 'free'
    const c = costs?.tiers?.[o.model]
    return c != null ? `${c} ⛁` : '—'
  }
  const primaryAction = mode === 'text' ? startText : mode === 'imagine' ? startImagineTo3D : startImage
  // disabled-state label that tells the user WHAT to do (the button never just
  // sits dead with no explanation)
  const ctaHint =
    mode === 'text'
      ? 'Describe your model to start'
      : mode === 'image'
        ? 'Add a reference image'
        : 'Generate an image first'
  // live placeholder: the typewriter text (with a caret) while empty
  const placeholder = typed ? `${typed}▍` : 'Describe your model…'

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
        <div className="tool-block">
          <span className="tool-label">Describe</span>
          <div className="reactor">
            <textarea
              id="gen-prompt"
              className="reactor-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={placeholder}
              disabled={busy}
            />
            <MicButton onTranscript={appendSpeech} disabled={busy} />
          </div>
          {!generating && (
            <div className="seed-row">
              <span className="seed-label">Try</span>
              {QUICK_PROMPTS.map((p) => (
                <button key={p} type="button" className="seed" onClick={() => setPrompt(p)} disabled={disabled}>
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="seed seed--dice"
                onClick={() => setPrompt(QUICK_PROMPTS[Math.floor(Math.random() * QUICK_PROMPTS.length)])}
                disabled={disabled}
                title="Surprise me"
                aria-label="Surprise me"
              >
                🎲
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'imagine' && (
        <>
          <div className="tool-block">
            <span className="tool-label">Imagine an image</span>
            <div className="reactor">
              <textarea
                id="gen-imagine"
                className="reactor-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={placeholder}
                disabled={genImgLoading || disabled}
              />
              <MicButton onTranscript={appendSpeech} disabled={genImgLoading || disabled} />
            </div>
            <button
              className="tool-cta"
              onClick={generatePhoto}
              disabled={genImgLoading || disabled || !prompt.trim()}
            >
              {genImgLoading
                ? 'Generating image…'
                : !prompt.trim()
                  ? 'Describe the image to start'
                  : versions.length
                    ? 'Generate new image'
                    : 'Generate image'}
            </button>
            {genImgError && <span className="url-error">{genImgError}</span>}
          </div>

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
                  <span className="hint">Pick an engine below, then Create 3D model.</span>
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

      {(mode !== 'imagine' || currentImage) && (
      <div className="tool-block">
        <span className="tool-label">Model</span>
        <div className="opt-grid">
          {MODEL_OPTIONS.map((o) => {
            const on = activeModel?.id === o.id
            return (
              <button
                key={o.id}
                type="button"
                className={`opt-card ${on ? 'on' : ''}`}
                onClick={() => pickModel(o)}
                disabled={busy}
                title={o.engine === 'tripo' ? 'Tripo — one-step textured model' : `Meshy ${o.model}`}
              >
                <span className="opt-card-name">{o.name}</span>
                <span className="opt-card-desc">{o.desc}</span>
                <span className="opt-card-cost">{costLabel(o)}</span>
              </button>
            )
          })}
        </div>

        {engine === 'meshy' && mode === 'text' && (
          <label className="switch-row">
            <span className="switch-text">
              <span className="switch-name">Colour textures</span>
              <span className="switch-sub">
                {textured ? `full-colour PBR · +${costs?.refine ?? 20} ⛁` : 'grey clay preview'}
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={textured}
              onChange={(e) => setTextured(e.target.checked)}
              disabled={busy}
            />
          </label>
        )}

        {engine === 'tripo' && (
          <label className="switch-row">
            <span className="switch-text">
              <span className="switch-name">Split into parts</span>
              <span className="switch-sub">
                {segmentOnCreate ? 'editable segments · +~40 ⛁' : 'one solid mesh'}
              </span>
            </span>
            <input
              type="checkbox"
              className="switch"
              checked={segmentOnCreate}
              onChange={(e) => setSegmentOnCreate(e.target.checked)}
              disabled={busy}
            />
          </label>
        )}

        {engine === 'tripo' && mode === 'imagine' && (
          <div className="mv-count" role="radiogroup" aria-label="Reference views">
            <span className="switch-sub">Views</span>
            {[
              [1, '1 · quick'],
              [2, '2 · front+side'],
              [4, '4 · best'],
            ].map(([n, label]) => (
              <button
                key={n}
                type="button"
                className={`mv-count-btn ${genViews === n ? 'on' : ''}`}
                aria-pressed={genViews === n}
                disabled={busy}
                onClick={() => setGenViews(n)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {engine === 'tripo' && mode === 'imagine' && genViews > 1 && (
          <span className="hint">Extra views drawn by Gemini → Tripo multi-view.</span>
        )}

        <button
          className="tool-cta"
          onClick={primaryAction}
          disabled={generating || disabled || !canGenerate}
        >
          {generating ? (
            `Forging… ${task.progress}%`
          ) : !canGenerate ? (
            ctaHint
          ) : (
            <>
              {mode === 'text' ? 'Forge 3D model' : 'Create 3D model'}
              {estCost != null && <span className="tool-cta-cost">{estCost} ⛁</span>}
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
      </div>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
