import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

const Heart = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path
      d="M12 21s-7.5-4.7-10-9.3C.5 8.4 2.2 5 5.6 5c2 0 3.3 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5 17.8 5 19.5 8.4 18 11.7 15.5 16.3 12 21 12 21z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

/** A published model's page: cinematic rotating viewer, likes, comments, share. */
export default function PostPage() {
  const { id } = useParams()
  const { user, token } = useAuth()
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)
  const stageRef = useRef(null)

  const present = () => stageRef.current?.requestFullscreen?.().catch(() => {})

  useEffect(() => {
    let cancelled = false
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    Promise.all([
      fetch(`/api/posts/${id}`, { headers }).then(async (r) => ({ ok: r.ok, data: await r.json() })),
      fetch(`/api/posts/${id}/comments`).then((r) => r.json()),
    ])
      .then(([p, c]) => {
        if (cancelled) return
        if (!p.ok) throw new Error(p.data.error || `HTTP`)
        setPost(p.data.post)
        setComments(c.comments || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [id, token])

  const toggleLike = async () => {
    if (!token) return
    const res = await fetch(`/api/posts/${id}/like`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const { liked, likes } = await res.json()
      setPost((p) => ({ ...p, likedByMe: liked, likes }))
    }
  }

  const submitComment = async (e) => {
    e.preventDefault()
    if (!body.trim() || !token) return
    const res = await fetch(`/api/posts/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ body: body.trim() }),
    })
    if (res.ok) {
      const { comment } = await res.json()
      setComments((cs) => [...cs, comment])
      setBody('')
      setPost((p) => ({ ...p, comments: (p.comments ?? 0) + 1 }))
    }
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard may be blocked; ignore
    }
  }

  if (error) return <div className="post-page"><span className="url-error">{error}</span></div>
  if (!post) return <div className="post-page"><span className="hint">Loading…</span></div>

  return (
    <div className="post-page">
      <div className="post-stage" ref={stageRef}>
        <ModelViewer modelUrl={post.modelUrl} points={[]} onAddPoint={() => {}} showcase />
      </div>
      <div className="post-info">
        <h1 className="post-page-title">{post.title}</h1>
        <div className="post-page-meta">
          <Link to={`/u/${post.authorUsername}`} className="post-author">
            @{post.authorUsername}
          </Link>
          {post.createdAt && <span>· {new Date(post.createdAt).toLocaleDateString()}</span>}
        </div>
        {post.description && <p className="post-page-desc">{post.description}</p>}
        <div className="post-actions">
          <button
            className={`like-button ${post.likedByMe ? 'liked' : ''}`}
            onClick={toggleLike}
            disabled={!token}
            title={token ? 'Like' : 'Log in to like'}
          >
            <Heart filled={post.likedByMe} /> {post.likes ?? 0}
          </button>
          <Link className="ghost-button" to={`/forge?model=${encodeURIComponent(post.modelUrl)}`}>
            Open in Forge
          </Link>
          <button className="ghost-button" onClick={share}>
            {copied ? 'Link copied' : 'Share'}
          </button>
          <button className="ghost-button" onClick={present}>
            Present
          </button>
        </div>

        <div className="post-comments">
          <h2>Comments ({comments.length})</h2>
          {user ? (
            <form className="comment-form" onSubmit={submitComment}>
              <input
                type="text"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a comment…"
                maxLength={1000}
              />
              <button className="submit" disabled={!body.trim()}>
                Post
              </button>
            </form>
          ) : (
            <p className="hint">
              <Link to="/login">Log in</Link> to comment.
            </p>
          )}
          <div className="comment-list">
            {comments.map((c) => (
              <div className="comment" key={c.id}>
                <Link to={`/u/${c.authorUsername}`} className="post-author">
                  @{c.authorUsername}
                </Link>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
