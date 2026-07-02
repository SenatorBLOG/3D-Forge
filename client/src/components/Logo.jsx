/** The 3D Forge mark: an isometric cube with a charged neon top face. */
export default function Logo({ size = 32 }) {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="forgeTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <polygon points="16,3 29,10.5 16,18 3,10.5" fill="url(#forgeTop)" />
      <polygon points="3,10.5 16,18 16,30 3,22.5" fill="#0c0f18" stroke="#22d3ee" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="29,10.5 16,18 16,30 29,22.5" fill="#141a26" stroke="#ff2d9b" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}
