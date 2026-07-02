// Initial-avatar: first letter on a color. Uses the user's chosen `color` when
// set, otherwise a color deterministically derived from the name.
export const AVATAR_COLORS = ['#ff7a1f', '#5cc8ff', '#5fd38a', '#c08bff', '#ff6b9d', '#ffc34d']

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
