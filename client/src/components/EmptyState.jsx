/** A designed empty/placeholder state: glyph + title + optional hint and action.
 *  Replaces bare "nothing here" text lines across the community pages. */
export default function EmptyState({ icon = 'box', title, hint, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-glyph">{GLYPHS[icon] || GLYPHS.box}</div>
      <p className="empty-state-title">{title}</p>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}

// minimal line-art glyphs (stroke uses currentColor so they inherit the dim tone)
const GLYPHS = {
  box: (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" strokeLinejoin="round" />
      <path d="M3 7l9 4.5L21 7M12 11.5V21.5" strokeLinejoin="round" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.9 6.6 20l1-6.1L3.2 9.5l6.1-.9L12 3Z" strokeLinejoin="round" />
    </svg>
  ),
  badge: (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 14 7 22l5-2.5L17 22l-1.5-8" strokeLinejoin="round" />
    </svg>
  ),
}
