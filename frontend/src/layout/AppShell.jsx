import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, BookOpen, ChartNoAxesCombined, ChevronDown, CircleDollarSign, CircleUserRound, LibraryBig, LogOut, Menu, Repeat2, Search, BookmarkCheck, IdCard, Boxes, Settings2, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth.js'
import { api } from '../services/api.js'

const titles = { '/': 'Overview', '/catalogue': 'Catalogue', '/notifications': 'Notifications', '/members': 'Members', '/circulation': 'Circulation', '/reports': 'Reports', '/reservations': 'Reservations', '/fines': 'Fines & payments', '/account': 'My account', '/inventory': 'Books & inventory', '/administration': 'Administration' }
const roleNames = { super_admin: 'Super administrator', librarian: 'Librarian', auditor: 'Read-only auditor', member: 'Library member' }

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [search, setSearch] = useState('')
  const [todayLabel] = useState(() => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()))

  useEffect(() => {
    api.get('/notifications').then(({ data }) => {
      setUnread((data.data || []).filter((item) => !item.is_read).length)
    }).catch(() => setUnread(0))
  }, [location.pathname])

  async function signOut() {
    setSigningOut(true)
    try {
      await logout()
    } catch (error) {
      toast.error(error.response?.data?.error?.message || 'The server could not confirm logout. Your local session was cleared.')
    } finally {
      setProfileOpen(false)
      navigate('/login', { replace: true })
    }
  }

  function searchCatalogue(event) {
    event.preventDefault()
    const query = search.trim()
    navigate(query ? `/catalogue?q=${encodeURIComponent(query)}` : '/catalogue')
    setMobileOpen(false)
  }

  const initials = user.fullName?.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  const permissions = user.permissions || []

  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-row">
        <Link className="brand" to="/" onClick={() => setMobileOpen(false)}>
          <span className="brand-mark"><LibraryBig size={21} /></span>
          <span className="brand-name">LibraCore<span>UNIVERSITY LIBRARY</span></span>
        </Link>
        <button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button>
      </div>
      <div className="branch-label"><span className="branch-dot" /> CENTRAL CAMPUS</div>
      <nav className="primary-nav" aria-label="Main navigation">
        <span className="nav-caption">LIBRARY</span>
        <NavLink end to="/" onClick={() => setMobileOpen(false)}><Activity size={18} /><span>Overview</span></NavLink>
        <NavLink to="/catalogue" onClick={() => setMobileOpen(false)}><BookOpen size={18} /><span>Catalogue</span></NavLink>
        <NavLink to="/notifications" onClick={() => setMobileOpen(false)}><Bell size={18} /><span>Notifications</span>{unread > 0 && <span className="nav-badge">{unread}</span>}</NavLink>
        {permissions.includes('members.read') && <NavLink to="/members" onClick={() => setMobileOpen(false)}><CircleUserRound size={18} /><span>Members</span></NavLink>}
        {permissions.includes('books.write') && <NavLink to="/inventory" onClick={() => setMobileOpen(false)}><Boxes size={18} /><span>Books & inventory</span></NavLink>}
        {permissions.includes('circulation.manage') && <NavLink to="/circulation" onClick={() => setMobileOpen(false)}><Repeat2 size={18} /><span>Circulation desk</span></NavLink>}
        {permissions.includes('reports.view') && <NavLink to="/reports" onClick={() => setMobileOpen(false)}><ChartNoAxesCombined size={18} /><span>Reports</span></NavLink>}
        {(permissions.includes('settings.manage') || permissions.includes('users.manage') || permissions.includes('audit.view') || permissions.includes('branches.manage')) && <NavLink to="/administration" onClick={() => setMobileOpen(false)}><Settings2 size={18} /><span>Administration</span></NavLink>}
        <NavLink to="/reservations" onClick={() => setMobileOpen(false)}><BookmarkCheck size={18} /><span>Reservations</span></NavLink>
        <NavLink to="/fines" onClick={() => setMobileOpen(false)}><CircleDollarSign size={18} /><span>Fines & payments</span></NavLink>
        {user.role === 'member' && <NavLink to="/account" onClick={() => setMobileOpen(false)}><IdCard size={18} /><span>My account</span></NavLink>}
      </nav>
      <div className="sidebar-bottom">
        <div className="branch-status"><span className="status-indicator" /><div><strong>Library services</strong><small>Connected to campus</small></div></div>
        <button className="profile-row" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
          <span className="avatar">{initials}</span><span className="profile-copy"><strong>{user.fullName}</strong><small>{roleNames[user.role] || 'Library staff'}</small></span><ChevronDown size={16} className={profileOpen ? 'rotate-icon' : ''} />
        </button>
        {profileOpen && <button className="signout-menu" onClick={signOut} disabled={signingOut}><LogOut size={16} /> Sign out</button>}
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
        <div className="breadcrumbs"><span>Library</span><span className="crumb-slash">/</span><strong>{titles[location.pathname] || 'Overview'}</strong></div>
        <form className="global-search" onSubmit={searchCatalogue} role="search"><Search size={17} /><input aria-label="Search the catalogue" placeholder="Search books, authors, ISBN…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>↵</kbd></form>
        <button className="top-user icon-button" title={user.fullName} onClick={() => setProfileOpen((open) => !open)}><span className="avatar avatar-small">{initials}</span></button>
        <button className="logout-button" onClick={signOut} disabled={signingOut} title="End your library session"><LogOut size={16} /><span>{signingOut ? 'Signing out…' : 'Log out'}</span></button>
      </header>
      <main className="page-content"><Outlet /></main>
      <footer className="app-footer"><span>LibraCore</span><span>Campus library services</span><span>{todayLabel}</span><Link to="/catalogue" aria-label="Browse catalogue"><ArrowRight size={14} /></Link></footer>
    </div>
  </div>
}