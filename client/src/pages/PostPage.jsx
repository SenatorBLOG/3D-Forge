import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import ModelViewer from '../components/ModelViewer.jsx'
import TagList from '../components/TagList.jsx'
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
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [error, setError] = useState(null)
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [copied, setCopied] = useState(false)
  // owner edit mode
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editError, setEditError] = useState(null)
  const [saving, setSaving] = useState(false)
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

  const startEdit = () => {
    setEditTitle(post.title)
    setEditDesc(post.description || '')
    setEditTags((post.tags || []).join(', '))
    setEditError(null)
    setEditing(true)
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editTitle.trim()) return
    setSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc,
          tags: editTags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setPost(data.post)
      setEditing(false)
    } catch (err) {
      setEditError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const removePost = async () => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    const res = await fetch(`/api/posts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) navigate(`/u/${post.authorUsername}`)
  }

  if (error) return <div className="post-page"><span className="url-error">{error}</span></div>
  if (!post) return <div className="post-page"><span className="hint">Loading…</span></div>

  const isOwner = !!(user && user.id === post.authorId)

  return (
    <div className="post-page">
      <div className="post-stage" ref={stageRef}>
        <ModelViewer modelUrl={post.modelUrl} points={[]} onAddPoint={() => {}} showcase />
      </div>
      <div className="post-info">
        {editing ? (
          <form className="post-edit" onSubmit={saveEdit}>
            <input
              className="post-edit-title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Title"
              maxLength={120}
            />
            <input
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="tags, comma-separated"
            />
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
              rows={3}
              maxLength={600}
            />
            <div className="post-edit-actions">
              <button className="submit" type="submit" disabled={!editTitle.trim() || saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="ghost-button" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
            {editError && <span className="url-error">{editError}</span>}
          </form>
        ) : (
          <>
            <h1 className="post-page-title">{post.title}</h1>
            <div className="post-page-meta">
              <Link to={`/u/${post.authorUsername}`} className="post-author">
                @{post.authorUsername}
              </Link>
              {post.createdAt && <span>· {new Date(post.createdAt).toLocaleDateString()}</span>}
            </div>
            <TagList tags={post.tags} />
            {post.description && <p className="post-page-desc">{post.description}</p>}
          </>
        )}
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
          {isOwner && !editing && (
            <>
              <button className="ghost-button" onClick={startEdit}>
                Edit
              </button>
              <button className="ghost-button danger" onClick={removePost}>
                Delete
              </button>
            </>
          )}
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
