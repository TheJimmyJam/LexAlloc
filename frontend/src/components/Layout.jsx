import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  LayoutDashboard, FolderOpen, Settings, LogOut,
  Shield, Menu, X, UserCircle, ShieldCheck, Database, BookOpen
} from 'lucide-react'
import { useState } from 'react'

const staffNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/matters',   icon: FolderOpen,      label: 'Matters' },
  { to: '/insurers',  icon: BookOpen,        label: 'Insurers' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
]

const clientNavItems = [
  { to: '/portal',   icon: ShieldCheck, label: 'My Portal' },
  { to: '/settings', icon: Settings,    label: 'Settings' },
]

export default function Layout() {
  const { profile, signOut, isProfileIncomplete } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

  const isClient = profile?.role === 'client'
  const navItems = isClient ? clientNavItems : staffNavItems

  const NavItems = () => (
    <>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to} to={to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
      {profile?.role === 'admin' && (
        <NavLink
          to="/admin"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
          onClick={() => setSidebarOpen(false)}
        >
          <Shield className="h-4 w-4" />
          Admin
        </NavLink>
      )}
    </>
  )

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-60 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex items-center px-4 h-20 border-b border-slate-800 flex-shrink-0 bg-slate-900">
          <img src="/logo.svg" alt="LexAlloc" className="h-14 w-auto" />
        </div>

        {/* Org badge */}
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Organization</p>
          <p className="text-sm font-semibold text-slate-800 truncate mt-0.5">
            {profile?.la_organizations?.name || 'Loading…'}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <NavItems />
        </nav>

        {/* User */}
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-sm">
              {(profile?.first_name?.[0] || profile?.email?.[0] || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {profile?.first_name} {profile?.last_name}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-slate-400 capitalize">{profile?.role || 'user'}</p>
                {profile?.is_platform_admin && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-violet-600 bg-violet-50 rounded px-1 py-0.5 leading-none">
                    <Database className="h-2.5 w-2.5" /> DB Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={handleSignOut} className="btn-secondary w-full justify-center text-xs">
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-16 bg-slate-900 border-b border-slate-800 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="p-1">
            <Menu className="h-5 w-5 text-slate-300" />
          </button>
          <img src="/logo.svg" alt="LexAlloc" className="h-12 w-auto" />
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
