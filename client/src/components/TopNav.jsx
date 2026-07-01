import { Link, NavLink } from 'react-router-dom'
import Logo from './Logo.jsx'
import Avatar from './Avatar.jsx'
import NotificationsBell from './NotificationsBell.jsx'
import WalletChip from './WalletChip.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

/** Global navigation: brand, primary links, and the auth area. */
export default function TopNav() {
  const { user, logout } = useAuth()

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
        <NavLink to="/explore">Explore</NavLink>
      </nav>

      <div className="topnav-auth">
        {user ? (
          <>
            <WalletChip />
            <NotificationsBell />
            <Link to={`/u/${user.username}`} className="topnav-user">
              <Avatar username={user.username} size={26} />@{user.username}
            </Link>
            <button className="ghost-button" onClick={logout}>
              Log out
            </button>
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
