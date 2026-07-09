import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'

const QUICK = ['a neon samurai helmet', 'a small dragon', 'a hover bike', 'a rune-etched axe']
const HOME_LIMIT = 12

/** Landing = the generator console. Type a prompt or drop an image and it hands
 *  off to the Forge (which auto-starts the generation). A wall of community
 *  models sits directly below — no marketing, no spinning placeholder. */
export default function HomePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('text') // 'text' | 'image'
  const [prompt, setPrompt] = useState('')
  const [engine, setEngine] = useState('meshy') // 'meshy' | 'tripo'
  const [textured, setTextured] = useState(false) // Meshy-only texturing stage
  const [image, setImage] = useState(null) // { id }
  const [preview, setPreview] = useState(null) // object URL
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(null)
  const [posts, setPosts] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/posts')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => !cancelled && setPosts(d.posts || []))
      .catch(() => !cancelled && setPosts([]))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

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
    const f = e.dataTransfer.files?.[0]
    if (f) uploadImage(f)
  }
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
    if (item) uploadImage(item.getAsFile())
  }

  const canGenerate = mode === 'text' ? !!prompt.trim() : !!image
  const generate = () => {
    // texturing is Meshy-only; Tripo returns a finished textured model
    const extra = `&engine=${engine}${engine === 'meshy' && textured ? '&textured=1' : ''}`
    if (mode === 'text') {
      const p = prompt.trim()
      if (!p) return
      navigate(`/forge?prompt=${encodeURIComponent(p)}&autostart=1${extra}`)
    } else {
      if (!image) return
      navigate(`/forge?mode=image&imageId=${encodeURIComponent(image.id)}&autostart=1${extra}`)
    }
  }

  // honest, derived community stats (no fabricated logos/testimonials)
  const stats = posts
    ? {
        models: posts.length,
        creators: new Set(posts.map((p) => p.authorUsername)).size,
        themes: new Set(posts.flatMap((p) => p.tags || [])).size,
      }
    : null

  return (
    <div className="home">
      <section className="gen-console">
        <div className="gen-console-inner" onPaste={mode === 'image' ? onPaste : undefined}>
          <span className="gen-console-kicker">TEXT · IMAGE → 3D</span>

          <div className="gen-console-tabs">
            <button
              className={`gen-console-tab ${mode === 'text' ? 'active' : ''}`}
              onClick={() => setMode('text')}
            >
              Describe
            </button>
            <button
              className={`gen-console-tab ${mode === 'image' ? 'active' : ''}`}
              onClick={() => setMode('image')}
            >
              From image
            </button>
          </div>

          {mode === 'text' ? (
            <>
              <textarea
                className="gen-console-input"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
                }}
                placeholder="Describe anything to forge in 3D — e.g. “a neon samurai helmet, battle-worn”"
                autoFocus
              />
              <div className="gen-console-quick">
                {QUICK.map((q) => (
                  <button key={q} className="chip" onClick={() => setPrompt(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div
                className={`image-drop gen-console-drop ${preview ? 'has-image' : ''}`}
                onClick={() => fileRef.current?.click()}
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
                    <span className="hint">PNG · JPEG · GIF · WEBP — we’ll turn it into 3D</span>
                  </div>
                )}
                {uploading && <div className="image-drop-busy">Uploading…</div>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              {imgError && <span className="url-error">{imgError}</span>}
            </>
          )}

          <div className="gen-console-options">
            <div className="model-select">
              <span className="model-label">Engine</span>
              <button
                type="button"
                className={`chip ${engine === 'meshy' ? 'chip--on' : ''}`}
                onClick={() => setEngine('meshy')}
                title="Meshy — tiered previews, optional texturing stage"
              >
                Meshy
              </button>
              <button
                type="button"
                className={`chip ${engine === 'tripo' ? 'chip--on' : ''}`}
                onClick={() => setEngine('tripo')}
                title="Tripo — builds a finished, already-textured model in one step"
              >
                Tripo
              </button>
            </div>
            <label className={`toggle ${engine === 'tripo' ? 'toggle--disabled' : ''}`}>
              <input
                type="checkbox"
                checked={engine === 'meshy' && textured}
                onChange={(e) => setTextured(e.target.checked)}
                disabled={engine === 'tripo'}
              />
              Add textures (color){' '}
              <span className="hint">
                {engine === 'tripo' ? '(Tripo textures in one step)' : textured ? '(colored)' : '(off — gray)'}
              </span>
            </label>
          </div>

          <button className="submit gen-console-go" onClick={generate} disabled={!canGenerate || uploading}>
            {uploading ? 'Uploading…' : 'Generate 3D'}
          </button>
        </div>

      </section>

      <section className="home-community">
        <div className="home-community-head">
          <h2>Forged by the community</h2>
          <Link className="ghost-button" to="/explore">
            Explore all
          </Link>
        </div>

        {posts && posts.length > 0 ? (
          <div className="explore-grid">
            {posts.slice(0, HOME_LIMIT).map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        ) : posts && posts.length === 0 ? (
          <div className="home-community-empty">
            <p>No models published yet — be the first.</p>
            <Link className="submit" to="/forge">
              Open the Forge
            </Link>
          </div>
        ) : (
          <CardSkeleton count={HOME_LIMIT} />
        )}
      </section>

      {/* compact footer: honest stats + a collapsed how-it-works (the design
          should explain itself — this stays out of the way) */}
      <footer className="home-foot">
        {stats && stats.models > 0 && (
          <div className="home-stats">
            <span>
              <strong>{stats.models}</strong> models
            </span>
            <span>
              <strong>{stats.creators}</strong> creators
            </span>
            <span>
              <strong>{stats.themes}</strong> themes
            </span>
          </div>
        )}
        <details className="home-how-details">
          <summary>How it works</summary>
          <ol className="home-how-list">
            <li>Describe it or drop an image.</li>
            <li>Generate — the model lands in the Forge.</li>
            <li>Click any part and describe a local change (Spatial edit).</li>
          </ol>
        </details>
      </footer>
    </div>
  )
}
