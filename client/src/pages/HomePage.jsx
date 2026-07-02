import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import PostCard from '../components/PostCard.jsx'
import CardSkeleton from '../components/CardSkeleton.jsx'

const THEMES = ['Dragon', 'Sci-fi helmet', 'Castle', 'Anime', 'Vehicle', 'Sword']
const HOME_LIMIT = 8

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <circle cx="8.5" cy="9.5" r="1.6" />
    <path d="M21 16l-5-5L5 20" />
  </svg>
)

const SparkIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5 10.2 7.7z" />
    <path d="M19 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </svg>
)

/** Landing / "Create" home: greeting, two entry modes (image or describe), theme
 *  shortcuts, and a live gallery of the community's latest models. */
export default function HomePage() {
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/posts')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => {
        if (!cancelled) setPosts((d.posts || []).slice(0, HOME_LIMIT))
      })
      .catch(() => {
        if (!cancelled) setPosts([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-copy">
          <span className="home-eyebrow">AI-assisted 3D · in your browser</span>
          <h1 className="home-title">
            What do you want to <span className="accent">make today?</span>
          </h1>
          <p className="home-sub">
            Generate a 3D model, then edit it by pointing at the part you want to change.
          </p>

          <div className="create-cards">
            <Link className="create-card" to="/forge?mode=image">
              <span className="create-icon">
                <ImageIcon />
              </span>
              <h3>Start from an image</h3>
              <p>Upload or paste a reference — get a 3D model.</p>
              <span className="create-badge">image → 3D</span>
            </Link>
            <Link className="create-card" to="/forge?mode=text">
              <span className="create-icon steel">
                <SparkIcon />
              </span>
              <h3>Describe it</h3>
              <p>Tell us what to build in plain words.</p>
              <span className="create-badge steel">text → 3D</span>
            </Link>
          </div>

          <div className="home-themes">
            <span className="home-themes-label">Or jump into a theme</span>
            <div className="theme-chips">
              {THEMES.map((t) => (
                <Link key={t} className="theme-chip" to={`/explore?q=${encodeURIComponent(t)}`}>
                  {t}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="home-showcase">
          <ModelViewer
            modelUrl="/models/robotic_hand.glb"
            points={[]}
            onAddPoint={() => {}}
            showcase
          />
        </div>
      </section>

      <section className="home-community">
        <div className="home-community-head">
          <div>
            <h2>Forged by the community</h2>
            <p className="hint">Real models people have published — spin them, like them, remix them.</p>
          </div>
          <Link className="ghost-button" to="/explore">
            Explore all
          </Link>
        </div>

        {posts && posts.length > 0 ? (
          <div className="explore-grid">
            {posts.map((p) => (
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
    </div>
  )
}
