import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'

/** A community feed card. Static placeholder thumbnail (no live WebGL per card —
 *  that would exhaust the browser's context limit on a large feed). */
export default function PostCard({ post }) {
  return (
    <Link className="post-card" to={`/post/${post.id}`}>
      <div className="post-thumb">
        <Logo size={56} />
      </div>
      <div className="post-card-body">
        <h3 className="post-card-title" title={post.title}>
          {post.title}
        </h3>
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
