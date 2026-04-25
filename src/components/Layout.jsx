import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  LayoutDashboard, FolderOpen, Settings, LogOut,
  Shield, Menu, X
} from 'lucide-react'

import { useState } from 'react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/matters',   icon: FolderOpen,      label: 'Matters' },
  { to: '/settings',  icon: Settings,        label: 'Settings' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => { await signOut(); navigate('/login') }

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
          style={({ isActive }) => isActive ? {} : {}}
          onClick={() => setSidebarOpen(false)}
        >
          <Icon className="h-4 w-4 flex-shrink-0" />
          {label}
        </NavLink>
      ))}
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
    <div className="flex h-screen bg-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 flex flex-col transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:flex ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

        {/* Logo */}
        <div className="flex items-center px-4 border-b border-slate-800 flex-shrink-0" style={{ height: '88px' }}>
          <img src="/logo.svg" alt="LexAlloc" className="w-full h-auto" style={{ maxHeight: '64px', objectFit: 'contain' }} />
        </div>

        {/* Org badge */}
        <div className="px-4 py-3.5 border-b border-slate-800/60">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Organization</p>
          <p className="text-sm font-semibold text-slate-200 truncate">
            {profile?.organizations?.name || 'Loading…'}
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
              <p className="text-xs text-slate-500 capitalize">{profile?.role || 'user'}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs font-medium transition-all duration-150"
          >
            <LogOut className="h-3 w-3" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-slate-200 flex-shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <span className="font-semibold text-slate-800 text-sm">LexAlloc</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
