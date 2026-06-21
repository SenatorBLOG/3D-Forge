import { Link } from 'react-router-dom'
import Logo from './Logo.jsx'

const forgeLink = (post) => `/forge?model=${encodeURIComponent(post.modelUrl)}`

/**
 * A community post in the Explore grid. Uses a static placeholder (not a live
 * WebGL viewer) so a large feed doesn't exhaust the browser's context limit —
 * the model opens for real in the Forge.
 */
export default function PostCard({ post }) {
  return (
    <div className="post-card">
      <Link
        className="post-thumb"
        to={forgeLink(post)}
        aria-label={`Open ${post.title} in the Forge`}
      >
        <Logo size={56} />
      </Link>
      <div className="post-card-body">
        <h3 className="post-card-title" title={post.title}>
          {post.title}
        </h3>
        {post.description && <p className="post-card-desc">{post.description}</p>}
        <div className="post-card-meta">
          <span className="post-author">@{post.authorUsername}</span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <Link className="ghost-button" to={forgeLink(post)}>
          Open in Forge
        </Link>
      </div>
    </div>
  )
}
