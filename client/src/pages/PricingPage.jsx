import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

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

const PACKS = [
  { n: 100, price: '$2' },
  { n: 500, price: '$8' },
  { n: 1200, price: '$15' },
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

/** Plans & token packs. Everything is simulated (no real payment). */
export default function PricingPage() {
  const [yearly, setYearly] = useState(true)
  const [costs, setCosts] = useState(null)
  const [chosen, setChosen] = useState(null)

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
              <button
                className={p.featured ? 'submit plan-cta' : 'ghost-button plan-cta'}
                onClick={() => (price === 0 ? null : setChosen(p.name))}
                disabled={price === 0}
              >
                {p.cta}
              </button>
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
          No subscription — token packs never expire.
          {costs && ` A Meshy-6 model costs ${costs.tiers?.['meshy-6']} tokens.`}
        </p>
        <div className="token-packs">
          {PACKS.map((pk) => (
            <div className="token-pack" key={pk.n}>
              <div className="token-pack-n">
                <Coin size={18} /> {pk.n}
              </div>
              <div className="token-pack-price">{pk.price}</div>
              <button className="ghost-button" onClick={() => setChosen(`${pk.n}-token pack`)}>
                Buy
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
