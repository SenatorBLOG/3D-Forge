import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

const Bell = () => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
)

const verb = (type) =>
  type === 'like' ? 'liked' : type === 'follow' ? 'started following you' : 'commented on'

// follow notifications point at the actor's profile; others at the post
const linkFor = (n) => (n.type === 'follow' ? `/u/${n.actorUsername}` : `/post/${n.postId}`)

/** Bell + unread badge in the top nav; opens a dropdown of recent activity and
 *  marks everything read on open. Polls the unread count while logged in. */
export default function NotificationsBell() {
  const { token } = useAuth()
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // poll the unread count (and refresh once on mount)
  useEffect(() => {
    if (!token) return
    let cancelled = false
    const load = () =>
      fetch('/api/notifications/count', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : { unread: 0 }))
        .then((d) => {
          if (!cancelled) setUnread(d.unread || 0)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 45000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [token])

  // close the dropdown on an outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (!next) return
    const headers = { Authorization: `Bearer ${token}` }
    const r = await fetch('/api/notifications', { headers })
    if (r.ok) setItems((await r.json()).notifications || [])
    if (unread > 0) {
      await fetch('/api/notifications/read', { method: 'POST', headers }).catch(() => {})
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    }
  }

  return (
    <div className="notif" ref={ref}>
      <button
        className="notif-bell"
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">Notifications</div>
          {items.length === 0 ? (
            <p className="notif-empty">Nothing yet — likes and comments show up here.</p>
          ) : (
            <div className="notif-list">
              {items.map((n) => (
                <Link
                  key={n.id}
                  to={linkFor(n)}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="notif-actor">@{n.actorUsername}</span> {verb(n.type)}
                  {n.type !== 'follow' && (
                    <> <span className="notif-post">{n.postTitle || 'your model'}</span></>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
