import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

// Plans + token packs are SIMULATED — this is a course project with no real
// payment. The numbers mirror a Meshy-style structure so the page reads real.
const PLANS = [
  {
    name: 'Free',
    price: { m: 0, y: 0 },
    tokens: 100,
    blurb: 'Kick the tires',
    features: ['100 tokens / month', 'Text & image → 3D', 'Community gallery', 'CC BY 4.0 license'],
    cta: 'Your plan',
  },
  {
    name: 'Pro',
    price: { m: 12, y: 9 },
    tokens: 1200,
    blurb: 'For regular makers',
    features: ['1,200 tokens / month', 'Everything in Free', 'Private models', 'Priority queue'],
    cta: 'Choose Pro',
  },
  {
    name: 'Premium',
    price: { m: 30, y: 24 },
    tokens: 4000,
    blurb: 'For pros & small teams',
    badge: 'Most popular',
    features: ['4,000 tokens / month', 'Everything in Pro', 'Commercial license', '4K PBR textures'],
    cta: 'Choose Premium',
    featured: true,
  },
  {
    name: 'Ultra',
    price: { m: 60, y: 48 },
    tokens: 12000,
    blurb: 'For studios',
    badge: 'Best value',
    features: ['12,000 tokens / month', 'Everything in Premium', 'Highest priority', 'API access (soon)'],
    cta: 'Choose Ultra',
  },
]

const FAQ = [
  {
    q: 'What is a 3D-token?',
    a: 'Tokens are the credits you spend to generate. A preview costs 10 (Meshy-5) or 30 (Meshy-6) tokens; adding textures is +20. Your plan refills tokens every month.',
  },
  {
    q: 'Who owns the models I make?',
    a: 'On Free, published models use a CC BY 4.0 license (attribution). Paid plans unlock a private/commercial license so you fully own what you create.',
  },
  {
    q: 'Do unused tokens roll over?',
    a: 'Monthly plan tokens reset each cycle. One-off token packs never expire — top up any time.',
  },
  {
    q: 'Is this real billing?',
    a: 'No — this is a student project. Plans and payments are simulated: nothing is charged and no card is collected.',
  },
]

const Coin = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7l1.4 3.1L16.5 11 13.9 12.9 12 16l-1.9-3.1L7.5 11l3.1-.9z" fill="currentColor" />
  </svg>
)

/** Plans & token packs. Plans are simulated; token packs REALLY grant tokens
 *  to your wallet via Javid's B16 endpoint (still no real payment). */
export default function PricingPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [yearly, setYearly] = useState(true)
  const [costs, setCosts] = useState(null)
  const [packs, setPacks] = useState([]) // from GET /api/wallet/packages
  const [chosen, setChosen] = useState(null)
  const [buying, setBuying] = useState(null) // package id in flight
  const [bought, setBought] = useState(null) // { label, tokens, balance }
  const [buyError, setBuyError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/generate/costs')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setCosts(d))
      .catch(() => {})
    fetch('/api/wallet/packages')
      .then((r) => (r.ok ? r.json() : { packages: [] }))
      .then((d) => !cancelled && setPacks(d.packages || []))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const buyPack = async (pk) => {
    if (!user) {
      navigate('/login')
      return
    }
    setBuying(pk.id)
    setBuyError(null)
    setBought(null)
    try {
      const res = await fetch('/api/wallet/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package: pk.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setBought({ label: pk.label, tokens: pk.tokens, balance: data.balance })
    } catch (e) {
      setBuyError(e.message)
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="pricing">
      <div className="pricing-head">
        <span className="gen-console-kicker">SIMULATED · NO REAL PAYMENT</span>
        <h1>Plans &amp; tokens</h1>
        <p className="hint">Generate more, own your models, and skip the queue. Cancel anytime.</p>
        <div className="pricing-toggle">
          <button className={!yearly ? 'active' : ''} onClick={() => setYearly(false)}>
            Monthly
          </button>
          <button className={yearly ? 'active' : ''} onClick={() => setYearly(true)}>
            Yearly <span className="pricing-save">−20%</span>
          </button>
        </div>
      </div>

      {chosen && (
        <div className="pricing-banner">
          ✓ Simulated: you’d now be on <strong>{chosen}</strong>. No payment was taken.
          <button className="link-button" onClick={() => setChosen(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="pricing-grid">
        {PLANS.map((p) => {
          const price = yearly ? p.price.y : p.price.m
          return (
            <div key={p.name} className={`plan ${p.featured ? 'plan--featured' : ''}`}>
              {p.badge && <span className="plan-badge">{p.badge}</span>}
              <h2 className="plan-name">{p.name}</h2>
              <p className="plan-blurb">{p.blurb}</p>
              <div className="plan-price">
                <span className="plan-price-amt">${price}</span>
                <span className="plan-price-per">/ mo</span>
              </div>
              {yearly && price > 0 && <span className="plan-billed">billed yearly</span>}
              <div className="plan-tokens">
                <Coin size={16} /> {p.tokens.toLocaleString()} tokens / mo
              </div>
              {price === 0 ? (
                <span className="plan-current">✓ Your plan</span>
              ) : (
                <button
                  className={p.featured ? 'submit plan-cta' : 'ghost-button plan-cta'}
                  onClick={() => setChosen(p.name)}
                >
                  {p.cta}
                </button>
              )}
              <ul className="plan-features">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      <section className="pricing-packs">
        <h2 className="discover-section-title">Or top up tokens (one-off)</h2>
        <p className="hint">
          Packs land in your wallet instantly (simulated checkout — nothing is charged).
          {costs && ` A Meshy-6 model costs ${costs.tiers?.['meshy-6']} tokens.`}
        </p>
        {bought && (
          <div className="pricing-banner">
            ✓ {bought.label} pack added — <strong>+{bought.tokens}</strong> tokens, balance{' '}
            <strong>{bought.balance}</strong>.
            <button className="link-button" onClick={() => setBought(null)}>
              dismiss
            </button>
          </div>
        )}
        {buyError && <span className="url-error">{buyError}</span>}
        <div className="token-packs">
          {packs.map((pk) => (
            <div className="token-pack" key={pk.id}>
              <div className="token-pack-label">{pk.label}</div>
              <div className="token-pack-n">
                <Coin size={18} /> {pk.tokens.toLocaleString()}
              </div>
              <div className="token-pack-price">{pk.price}</div>
              <button
                className="submit token-pack-buy"
                onClick={() => buyPack(pk)}
                disabled={buying === pk.id}
              >
                {buying === pk.id ? 'Adding…' : user ? 'Buy' : 'Log in to buy'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="pricing-faq">
        <h2 className="discover-section-title">FAQ</h2>
        <div className="faq-list">
          {FAQ.map((f) => (
            <details className="faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="hint pricing-foot">
          Ready to make something?{' '}
          <Link className="link-button" to="/forge">
            Open the Forge →
          </Link>
        </p>
      </section>
    </div>
  )
}
