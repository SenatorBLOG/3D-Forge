/** The 3D Forge mark: an isometric cube with a molten top face being forged. */
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
          <stop offset="0" stopColor="#ffce9e" />
          <stop offset="0.5" stopColor="#ff7a1f" />
          <stop offset="1" stopColor="#d65a0a" />
        </linearGradient>
      </defs>
      <polygon points="16,3 29,10.5 16,18 3,10.5" fill="url(#forgeTop)" />
      <polygon points="3,10.5 16,18 16,30 3,22.5" fill="#12151d" stroke="#5cc8ff" strokeWidth="1" strokeLinejoin="round" />
      <polygon points="29,10.5 16,18 16,30 29,22.5" fill="#171b25" stroke="#3a4a5e" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}
