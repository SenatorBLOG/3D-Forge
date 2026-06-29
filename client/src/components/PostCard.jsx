import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'
import TagList from './TagList.jsx'
import { getThumbnail } from '../lib/thumbnailer.js'

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

  return (
    <Link className="post-card" to={`/post/${post.id}`}>
      <div className="post-thumb">
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
          <span className="post-author">@{post.authorUsername}</span>
          <span className="post-stats">
            <span className="heart">♥</span> {post.likes ?? 0} · {post.comments ?? 0}{' '}
            comments
          </span>
        </div>
      </div>
    </Link>
  )
}
