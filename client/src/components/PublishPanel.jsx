import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

/** Publish the currently loaded model to the community gallery (auth required). */
export default function PublishPanel({ modelUrl, description }) {
  const { user, token } = useAuth()
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  if (!user) {
    return (
      <section className="panel">
        <h2>Publish</h2>
        <span className="hint">Log in to publish this model to the community gallery.</span>
        <Link className="ghost-button" to="/login">
          Log in
        </Link>
      </section>
    )
  }

  const publish = async () => {
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          modelUrl,
          description: description || '',
          tags,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setTitle('')
      setTags('')
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2>Publish</h2>
      <div className="field">
        <label htmlFor="post-title">Title</label>
        <input
          id="post-title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDone(false)
          }}
          placeholder="My robotic hand"
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor="post-tags">Tags</label>
        <input
          id="post-tags"
          type="text"
          value={tags}
          onChange={(e) => {
            setTags(e.target.value)
            setDone(false)
          }}
          placeholder="robot, sci-fi, hand"
        />
        <span className="hint">Comma-separated · up to 6 · helps people find it on Explore.</span>
      </div>
      <button className="submit" onClick={publish} disabled={!title.trim() || busy}>
        {busy ? 'Publishing…' : 'Publish to gallery'}
      </button>
      {done && (
        <span className="hint">
          Published — see it in <Link to="/explore">Explore</Link>.
        </span>
      )}
      {error && <span className="url-error">{error}</span>}
    </section>
  )
}
