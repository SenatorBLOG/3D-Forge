import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

// a little 3D-token coin
const Coin = ({ size = 15 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M12 7l1.4 3.1L16.5 11 13.9 12.9 12 16l-1.9-3.1L7.5 11l3.1-.9z"
      fill="currentColor"
    />
  </svg>
)

const reasonLabel = (r) => {
  if (!r) return 'Adjustment'
  if (r === 'starter') return 'Welcome bonus'
  if (r.startsWith('gen')) return 'Generation'
  if (r.includes('refine') || r.includes('texture')) return 'Textures'
  if (r.includes('grant') || r.includes('buy')) return 'Top-up'
  return r
}

const PACKS = [
  { n: 100, price: '$2' },
  { n: 500, price: '$8' },
  { n: 1200, price: '$15' },
]

function BuyModal({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Get 3D-tokens</h3>
        <p className="hint">Tokens power your generations — spend them to make models.</p>
        <div className="token-packs">
          {PACKS.map((p) => (
            <div className="token-pack" key={p.n}>
              <div className="token-pack-n">
                <Coin size={18} /> {p.n}
              </div>
              <div className="token-pack-price">{p.price}</div>
              <button className="ghost-button" disabled>
                Soon
              </button>
            </div>
          ))}
        </div>
        <p className="hint">Checkout is coming soon — tokens are simulated for now.</p>
        <button className="ghost-button modal-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/** Nav chip showing the current user's 3D-token balance; opens a dropdown with
 *  recent activity and a "Get tokens" modal. */
export default function WalletChip() {
  const { token } = useAuth()
  const [wallet, setWallet] = useState(null) // { balance, history }
  const [open, setOpen] = useState(false)
  const [buy, setBuy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = () =>
      fetch('/api/wallet', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d) setWallet(d)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 30000) // reflect spends after a generation
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [token])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (wallet == null) return null

  return (
    <div className="wallet" ref={ref}>
      <button
        className="wallet-chip"
        onClick={() => setOpen((o) => !o)}
        title="Your 3D-tokens"
      >
        <Coin />
        <span>{wallet.balance}</span>
      </button>

      {open && (
        <div className="wallet-panel">
          <div className="wallet-balance">
            <Coin size={20} />
            <strong>{wallet.balance}</strong>
            <span>3D-tokens</span>
          </div>
          <div className="wallet-history">
            {wallet.history && wallet.history.length > 0 ? (
              wallet.history.slice(0, 5).map((h) => (
                <div className="wallet-row" key={h.id}>
                  <span>{reasonLabel(h.reason)}</span>
                  <span className={h.amount >= 0 ? 'pos' : 'neg'}>
                    {h.amount >= 0 ? '+' : ''}
                    {h.amount}
                  </span>
                </div>
              ))
            ) : (
              <p className="hint">No activity yet.</p>
            )}
          </div>
          <button
            className="submit wallet-get"
            onClick={() => {
              setBuy(true)
              setOpen(false)
            }}
          >
            Get tokens
          </button>
        </div>
      )}

      {buy && <BuyModal onClose={() => setBuy(false)} />}
    </div>
  )
}
