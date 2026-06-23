import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import PostCard from '../components/PostCard.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const FEATURES = [
  {
    title: 'Generate',
    body: 'Describe a model in plain text and get a 3D mesh you can spin in the browser.',
  },
  {
    title: 'Edit by region',
    body: 'Click the exact part you want to change — the system grounds your instruction in 3D space.',
  },
  {
    title: 'Compare & rate',
    body: 'Run an edit spatially vs as a plain prompt, see both side by side, and rate the result.',
  },
]

const HOME_LIMIT = 8

/** Landing page: hero with an auto-rotating model showcase, feature cards, and a
 *  live gallery of the community's latest published models (with likes). */
export default function HomePage() {
  const { user } = useAuth()
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
          <span className="home-eyebrow">AI-assisted 3D, in the browser</span>
          <h1 className="home-title">
            Forge 3D models by <span className="accent">pointing and talking</span>.
          </h1>
          <p className="home-sub">
            Generate a model from text, click the part you want to change, and describe
            the edit in plain language. No 3D modelling skills required.
          </p>
          <div className="home-cta">
            <Link className="submit" to="/forge">
              Open the Forge
            </Link>
            {!user && (
              <Link className="ghost-button" to="/register">
                Create an account
              </Link>
            )}
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

      <section className="home-features">
        {FEATURES.map((f, i) => (
          <div className="home-feature" key={f.title}>
            <span className="home-feature-num">{String(i + 1).padStart(2, '0')}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="home-community">
        <div className="home-community-head">
          <div>
            <h2>Forged by the community</h2>
            <p className="hint">Models people have published — spin them, like them, remix them.</p>
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
              {user ? 'Publish from the Forge' : 'Open the Forge'}
            </Link>
          </div>
        ) : (
          <p className="hint">Loading the gallery…</p>
        )}
      </section>
    </div>
  )
}
