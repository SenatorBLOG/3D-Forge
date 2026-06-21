import { Link } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
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

/** Landing page: hero with an auto-rotating model showcase + feature cards. */
export default function HomePage() {
  const { user } = useAuth()

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
    </div>
  )
}
