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
  autostart = false,
}) {
  const [mode, setMode] = useState(initialMode === 'image' ? 'image' : 'text')
  const [prompt, setPrompt] = useState(initialPrompt)
  // which Meshy model to generate with: meshy-5 (cheap) or meshy-6 (prettier)
  const [aiModel, setAiModel] = useState('meshy-5')
  // add the refine (texture/color) stage after preview
  const [textured, setTextured] = useState(false)
  // image mode: the uploaded reference (server id) + a local preview URL
  const [image, setImage] = useState(initialImageId ? { id: initialImageId } : null)
  const [preview, setPreview] = useState(null) // object URL for instant preview
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(null)
  const [costs, setCosts] = useState(null) // { tiers: {meshy-5,meshy-6}, refine }
  const fileRef = useRef(null)

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

  const estCost = costs
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
    if (initialMode === 'image' && initialImageId) {
      submittedRef.current = 'image → 3D'
      kindRef.current = 'image'
      start(
        '/api/generate',
        { mode: 'image', imageId: initialImageId, model: aiModel },
        { refine: textured, model: aiModel, prompt: 'image → 3D' },
      )
    } else if (initialPrompt.trim()) {
      const trimmed = initialPrompt.trim()
      submittedRef.current = trimmed
      kindRef.current = 'text'
      start(
        '/api/generate',
        { prompt: trimmed, model: aiModel },
        { refine: textured, model: aiModel, prompt: trimmed },
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

  const startText = () => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    submittedRef.current = trimmed
    kindRef.current = 'text'
    start(
      '/api/generate',
      { prompt: trimmed, model: aiModel },
      { refine: textured, model: aiModel, prompt: trimmed },
    )
  }
  const startImage = () => {
    if (!image) return
    submittedRef.current = 'image → 3D'
    kindRef.current = 'image'
    start(
      '/api/generate',
      { mode: 'image', imageId: image.id, model: aiModel },
      { refine: textured, model: aiModel, prompt: 'image → 3D' },
    )
  }

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
      </div>

      {mode === 'text' ? (
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
      ) : (
        <div className="field">
          <label>Reference image</label>
          <div
            className={`image-drop ${preview ? 'has-image' : ''}`}
            onClick={() => !busy && fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            role="button"
            tabIndex={0}
          >
            {preview ? (
              <img className="image-drop-preview" src={preview} alt="reference" />
            ) : (
              <div className="image-drop-empty">
                <strong>Click, drop, or paste an image</strong>
                <span className="hint">PNG · JPEG · GIF · WEBP</span>
              </div>
            )}
            {uploading && <div className="image-drop-busy">Uploading…</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          {preview && !busy && (
            <button className="link-button" onClick={() => fileRef.current?.click()}>
              Change image
            </button>
          )}
          {imgError && <span className="url-error">{imgError}</span>}
        </div>
      )}

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
      <label className="toggle">
        <input
          type="checkbox"
          checked={textured}
          onChange={(e) => setTextured(e.target.checked)}
          disabled={busy}
        />
        Add textures (color){' '}
        <span className="hint">
          ({textured ? `+${costs?.refine ?? 20} tokens, colored` : 'off — gray preview'})
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
        <span className="hint">mock mode — set MESHY_API_KEY on the server for real generation</span>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
