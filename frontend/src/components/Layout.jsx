import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useBranding } from '../context/BrandingContext.jsx'
import {
  LayoutDashboard, FolderOpen, Settings, LogOut,
  Shield, Menu, UserCircle, ShieldCheck, Database, BookOpen, BarChart3, FileBarChart,
  Moon, Sun
} from 'lucide-react'
import { useState } from 'react'
import { useTheme } from '../context/ThemeContext.jsx'

const staffNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/matters',   icon: FolderOpen,      label: 'Matters' },
  { to: '/reports',   icon: FileBarChart,    label: 'Reports' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
]

const clientNavItems = [
  { to: '/portal',   icon: ShieldCheck, label: 'My Portal' },
  { to: '/settings', icon: Settings,    label: 'Settings' },
]

export default function Layout() {
  const { profile, signOut, isProfileIncomplete } = useAuth()
  const { brandName, logoUrl } = useBranding()
  const { dark, toggle: toggleDark } = useTheme()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const appName = brandName || 'LexAlloc'
  const logoSrc = logoUrl  || '/logo-icon.png'

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const isClient = profile?.role === 'client'
  const navItems = isClient ? clientNavItems : staffNavItems

  const NavItems = () => (
    <>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {label}
        </NavLink>
      ))}
      {profile?.is_platform_admin && (
        <NavLink
          to="/financials"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <BarChart3 className="h-4 w-4 flex-shrink-0" />
          Financials
        </NavLink>
      )}
      {profile?.role === 'admin' && (
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/8'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <Shield className="h-4 w-4 flex-shrink-0" />
          Admin
        </NavLink>
      )}
    </>
  )

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Logo */}
        <div className="flex items-center px-5 border-b border-slate-800 flex-shrink-0" style={{ height: '72px' }}>
          <img src={logoSrc} alt={appName} className="rounded-full" style={{ width: '44px', height: '44px', objectFit: 'cover' }} />
        </div>

        {/* Org badge */}
        <div className="px-4 py-3.5 border-b border-slate-800/60">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Organization</p>
          <p className="text-sm font-semibold text-slate-200 truncate">
            {profile?.la_organizations?.name || 'Loading…'}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <NavItems />
        </nav>

        {/* User */}
        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
              {(profile?.first_name?.[0] || profile?.email?.[0] || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate">
                {profile?.first_name} {profile?.last_name}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-slate-500 capitalize">{profile?.role || 'user'}</p>
                {profile?.is_platform_admin && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-violet-400 bg-violet-500/10 rounded px-1 py-0.5 leading-none">
                    <Database className="h-2.5 w-2.5" /> DB Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSignOut}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium transition-all duration-150"
            >
              <LogOut className="h-3 w-3" /> Sign out
            </button>
            <button
              onClick={toggleDark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-all duration-150"
            >
              {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex justify-center gap-3 mt-2">
            <Link to="/privacy" className="text-slate-600 hover:text-slate-400 text-xs transition-colors">Privacy</Link>
            <span className="text-slate-700 text-xs">·</span>
            <Link to="/terms" className="text-slate-600 hover:text-slate-400 text-xs transition-colors">Terms</Link>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-slate-900 border-b border-slate-800 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            <Menu className="h-5 w-5 text-slate-300" />
          </button>
          <img src={logoSrc} alt={appName} className="rounded-full" style={{ width: '36px', height: '36px', objectFit: 'cover' }} />
        </header>

        {isProfileIncomplete && (
          <div className="bg-brand-600 text-white px-4 py-2.5 flex items-center justify-between text-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4" />
              <span>Welcome! Please finish setting up your profile.</span>
            </div>
            <Link to="/settings" className="underline font-medium hover:text-brand-200 transition-colors">
              Complete profile →
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
