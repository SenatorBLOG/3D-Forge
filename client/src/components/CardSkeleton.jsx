/** Shimmer placeholder cards that match PostCard's footprint, shown while a
 *  gallery grid loads — feels more designed than a "Loading…" line. */
export default function CardSkeleton({ count = 8 }) {
  return (
    <div className="explore-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton skeleton-thumb" />
          <div className="skeleton-card-body">
            <div className="skeleton skeleton-line" style={{ width: '70%' }} />
            <div className="skeleton skeleton-line" style={{ width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
