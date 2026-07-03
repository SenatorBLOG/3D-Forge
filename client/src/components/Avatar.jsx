// Initial-avatar: first letter on a color. Uses the user's chosen `color` when
// set, otherwise a color deterministically derived from the name.
// Neon Noir palette — keep in sync with server/src/routes/users.js
export const AVATAR_COLORS = ['#22d3ee', '#ff2d9b', '#a855f7', '#35e6a4', '#ffd23d', '#5b8cff']

function colorFor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function Avatar({ username, size = 40, color: picked }) {
  const color = picked || colorFor(username || '?')
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `${color}22`,
        color,
        borderColor: `${color}55`,
        fontSize: size * 0.42,
      }}
    >
      {(username || '?').charAt(0).toUpperCase()}
    </span>
  )
}
