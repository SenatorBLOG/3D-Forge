import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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

/** Nav chip showing the current user's 3D-token balance; opens a dropdown with
 *  recent activity and a link to the pricing page. */
export default function WalletChip() {
  const { token } = useAuth()
  const [wallet, setWallet] = useState(null) // { balance, history }
  const [open, setOpen] = useState(false)
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
          <Link className="submit wallet-get" to="/pricing" onClick={() => setOpen(false)}>
            Get tokens
          </Link>
        </div>
      )}
    </div>
  )
}
