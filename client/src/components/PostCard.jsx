import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'
import Avatar from './Avatar.jsx'
import TagList from './TagList.jsx'
import { getThumbnail } from '../lib/thumbnailer.js'

const HeartIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
    <path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.6 5.7 4.6 5c1.9-.4 3.6.5 4.4 1.9L12 8l3-1.1c.8-1.4 2.5-2.3 4.4-1.9 3 .7 4 4 2.6 6.8C19.5 16.4 12 21 12 21z" />
  </svg>
)

const CommentIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" strokeLinejoin="round" />
  </svg>
)

/** A community feed card. Shows a real model preview rendered once per model URL
 *  (shared cache — no live WebGL viewer per card). On hover the shaded preview
 *  cross-fades to a steel wireframe, revealing the geometry. Falls back to the
 *  logo while rendering / on error. */
export default function PostCard({ post }) {
  const [thumb, setThumb] = useState(null) // { shaded, wire }

  useEffect(() => {
    let cancelled = false
    getThumbnail(post.modelUrl)
      .then((urls) => {
        if (!cancelled) setThumb(urls)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [post.modelUrl])

  const kindLabel =
    post.kind === 'image' ? 'Image → 3D' : post.kind === 'text' ? 'Text → 3D' : null

  return (
    <Link className="post-card" to={`/post/${post.id}`}>
      <div className="post-thumb">
        {kindLabel && <span className={`kind-pill kind-${post.kind}`}>{kindLabel}</span>}
        {thumb ? (
          <>
            <img className="post-thumb-img shaded" src={thumb.shaded} alt={post.title} loading="lazy" />
            <img className="post-thumb-img wire" src={thumb.wire} alt="" aria-hidden="true" loading="lazy" />
            <span className="post-thumb-hint">wireframe</span>
          </>
        ) : (
          <Logo size={56} />
        )}
      </div>
      <div className="post-card-body">
        <h3 className="post-card-title" title={post.title}>
          {post.title}
        </h3>
        <TagList tags={post.tags} linkify={false} />
        <div className="post-card-meta">
          <span className="post-author">
            <Avatar username={post.authorUsername} size={18} />
            @{post.authorUsername}
          </span>
          <span className="post-stats">
            <span className="stat stat-like">
              <HeartIcon /> {post.likes ?? 0}
            </span>
            <span className="stat stat-comment">
              <CommentIcon /> {post.comments ?? 0}
            </span>
          </span>
        </div>
      </div>
    </Link>
  )
}
