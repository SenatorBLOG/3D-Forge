import { Link } from 'react-router-dom'

/** Tag chips. `linkify` renders them as links to /explore?tag=… ; pass false
 *  inside another <Link> (e.g. a feed card) to avoid nested anchors. */
export default function TagList({ tags, linkify = true }) {
  if (!tags || tags.length === 0) return null
  return (
    <div className="tag-list">
      {tags.map((t) =>
        linkify ? (
          <Link key={t} className="tag" to={`/explore?tag=${encodeURIComponent(t)}`}>
            #{t}
          </Link>
        ) : (
          <span key={t} className="tag">
            #{t}
          </span>
        ),
      )}
    </div>
  )
}
