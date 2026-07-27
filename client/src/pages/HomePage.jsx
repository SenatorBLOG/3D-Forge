import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PostCard from '../components/PostCard.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'
import MicButton from '../components/MicButton.jsx'
import { getThumbnail } from '../lib/thumbnailer.js'

const QUICK = ['a neon samurai helmet', 'a small dragon', 'a hover bike', 'a rune-etched axe']
const HOME_LIMIT = 12

// the prompt box "suggests ideas" by cycling its placeholder (Meshy-style)
const PLACEHOLDERS = [
  'a neon samurai helmet, battle-worn',
  'a cozy reading chair, walnut wood',
  'a low-poly dragon hatchling',
  'a sci-fi delivery drone',
  'an ancient rune-etched axe',
  'a chibi robot barista',
]

/** One pill in the auto-drifting community marquee. */
function MarqueeCard({ post, hidden }) {
  const [thumb, setThumb] = useState(null)
  useEffect(() => {
    let cancelled = false
    getThumbnail(post.modelUrl)
      .then((u) => !cancelled && setThumb(u.shaded))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [post.modelUrl])

  return (
    <Link
      className="marquee-card"
      to={`/post/${post.id}`}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
    >
      {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="marquee-ph" />}
      <span className="marquee-name">{post.title}</span>
    </Link>
  )
}

/** Landing = the generator console. Type a prompt or drop an image and it hands
 *  off to the Forge (which auto-starts the generation). A wall of community
 *  models sits directly below — no marketing, no spinning placeholder. */
export default function HomePage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('text') // 'text' | 'image'
  const [prompt, setPrompt] = useState('')
  const [image, setImage] = useState(null) // { id }
  const [preview, setPreview] = useState(null) // object URL
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(null)
  const [posts, setPosts] = useState(null)
  const [phIdx, setPhIdx] = useState(0)
  const fileRef = useRef(null)

  // rotate the prompt suggestion every few seconds
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 3500)
    return () => clearInterval(t)
  }, [])

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

  const canGenerate = mode === 'image' ? !!image : !!prompt.trim()
  const appendSpeech = (t) => setPrompt((p) => (p.trim() ? `${p.trim()} ${t}` : t))
  // the landing is a launchpad — it hands the idea to the Forge, where the engine
  // and texturing choices actually live (no duplicated controls here).
  const generate = () => {
    if (mode === 'image') {
      if (!image) return
      navigate(`/forge?mode=image&imageId=${encodeURIComponent(image.id)}&autostart=1`)
      return
    }
    const p = prompt.trim()
    if (!p) return
    // imagine → open the Forge's Imagine tab with the prompt (two-step: image → 3D);
    // describe → auto-start the 3D generation straight away
    if (mode === 'imagine') navigate(`/forge?mode=imagine&prompt=${encodeURIComponent(p)}`)
    else navigate(`/forge?prompt=${encodeURIComponent(p)}&autostart=1`)
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
        <h1 className="gen-title">
          Forge <span className="gen-title-grad">anything</span> in 3D
        </h1>
        <div className="gen-console-inner" onPaste={mode === 'image' ? onPaste : undefined}>
          <span className="tool-label">Create</span>

          <div className="gen-mode">
            {[
              ['text', 'Describe'],
              ['image', 'From image'],
              ['imagine', 'Imagine'],
            ].map(([m, label]) => (
              <button
                key={m}
                type="button"
                className={`gen-mode-tab ${mode === m ? 'active' : ''}`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode !== 'image' ? (
            <>
              <div className="reactor">
                <textarea
                  className="reactor-input"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
                  }}
                  placeholder={
                    mode === 'imagine'
                      ? `Describe an image to imagine — e.g. “${PLACEHOLDERS[phIdx]}”`
                      : `Describe anything to forge in 3D — e.g. “${PLACEHOLDERS[phIdx]}”`
                  }
                  autoFocus
                />
                <MicButton onTranscript={appendSpeech} />
              </div>
              <div className="seed-row">
                <span className="seed-label">Try</span>
                {QUICK.map((q) => (
                  <button key={q} type="button" className="seed" onClick={() => setPrompt(q)}>
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

          <button className="tool-cta gen-console-go" onClick={generate} disabled={!canGenerate || uploading}>
            {uploading ? 'Uploading…' : mode === 'imagine' ? 'Imagine it →' : 'Forge it →'}
          </button>
          <span className="gen-console-note">
            {mode === 'imagine'
              ? 'Make a reference image, then turn it into 3D — in the Forge.'
              : 'Pick the engine & textures in the Forge.'}
          </span>
        </div>

      </section>

      {/* auto-drifting community marquee (pauses on hover, click opens the post) */}
      {posts && posts.length >= 4 && (
        <div className="home-marquee">
          <div className="home-marquee-track">
            {posts.slice(0, 10).map((p) => (
              <MarqueeCard key={p.id} post={p} />
            ))}
            {posts.slice(0, 10).map((p) => (
              <MarqueeCard key={`dup-${p.id}`} post={p} hidden />
            ))}
          </div>
        </div>
      )}

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
