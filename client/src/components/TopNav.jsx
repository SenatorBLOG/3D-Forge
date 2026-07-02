import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import Logo from './Logo.jsx'
import Avatar from './Avatar.jsx'
import NotificationsBell from './NotificationsBell.jsx'
import WalletChip from './WalletChip.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

/** Global navigation: brand, primary links, and the auth area. */
export default function TopNav() {
  const { user, logout } = useAuth()
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!menu) return
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menu])

  return (
    <header className="topnav">
      <Link to="/" className="brand">
        <Logo size={34} />
        <span className="brand-name">
          3D<span className="brand-name-accent">FORGE</span>
        </span>
      </Link>

      <nav className="topnav-links">
        <NavLink to="/" end>
          Create
        </NavLink>
        <NavLink to="/forge">Forge</NavLink>
        <NavLink to="/discover">Discover</NavLink>
        <NavLink to="/explore">Explore</NavLink>
      </nav>

      <div className="topnav-auth">
        {user ? (
          <>
            <WalletChip />
            <NotificationsBell />
            <div className="user-menu" ref={ref}>
              <button
                className="topnav-user"
                onClick={() => setMenu((m) => !m)}
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <Avatar username={user.username} size={26} color={user.avatarColor} />@{user.username}
              </button>
              {menu && (
                <div className="user-menu-panel" role="menu">
                  <Link to={`/u/${user.username}`} role="menuitem" onClick={() => setMenu(false)}>
                    My profile
                  </Link>
                  <Link to="/account" role="menuitem" onClick={() => setMenu(false)}>
                    Account &amp; tokens
                  </Link>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenu(false)
                      logout()
                    }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Link className="ghost-button" to="/login">
              Log in
            </Link>
            <Link className="submit topnav-cta" to="/register">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  )
}
