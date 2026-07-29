import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'
import Avatar from './Avatar.jsx'
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
 *  (shared cache — no live WebGL viewer per card). On hover the textured preview
 *  cross-fades to a neutral gray clay render, revealing the sculpted form. Falls
 *  back to the logo while rendering / on error. */
export default function PostCard({ post }) {
  const [thumb, setThumb] = useState(null) // { shaded, clay, views }

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

  // varied card heights (masonry, Meshy-style): a deterministic pseudo-random
  // aspect per post so the wall doesn't line up in a rigid grid
  const RATIOS = ['1 / 1', '5 / 6', '4 / 5', '3 / 4', '5 / 7', '1 / 1.15']
  const seed = String(post.id ?? post.modelUrl ?? '')
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const ratio = RATIOS[Math.abs(h) % RATIOS.length]

  return (
    <Link className="post-card" to={`/post/${post.id}`} title={post.title}>
      <div className="post-thumb" style={{ aspectRatio: ratio }}>
        {/* author chip in the top corner (Meshy-style, replaces the kind badge) */}
        <span className="post-author-top">
          <Avatar username={post.authorUsername} size={16} />
          <span className="post-author-name">{post.authorUsername}</span>
        </span>
        {thumb ? (
          <>
            <img className="post-thumb-img shaded" src={thumb.shaded} alt={post.title} loading="lazy" />
            <img className="post-thumb-img clay" src={thumb.clay} alt="" aria-hidden="true" loading="lazy" />
            {thumb.views?.length > 0 && (
              <span className="post-thumb-views" aria-hidden="true">
                {thumb.views.map((v, i) => (
                  <img key={i} src={v} alt="" loading="lazy" />
                ))}
              </span>
            )}
          </>
        ) : (
          <Logo size={56} />
        )}
        <span className="post-stats-bot">
          <span className="stat stat-like">
            <HeartIcon /> {post.likes ?? 0}
          </span>
          <span className="stat stat-comment">
            <CommentIcon /> {post.comments ?? 0}
          </span>
        </span>
      </div>
    </Link>
  )
}
