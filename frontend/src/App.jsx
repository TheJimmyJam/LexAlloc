import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Layout from './components/Layout.jsx'
import { supabaseMisconfigured } from './lib/supabase.js'

// Pages
import Landing            from './pages/Landing.jsx'
import Login              from './pages/Login.jsx'
import Register           from './pages/Register.jsx'
import ForgotPassword     from './pages/ForgotPassword.jsx'
import Dashboard          from './pages/Dashboard.jsx'
import Matters            from './pages/Matters.jsx'
import MatterDetail       from './pages/MatterDetail.jsx'
import InvoiceDetail      from './pages/InvoiceDetail.jsx'
import Apportionment      from './pages/Apportionment.jsx'
import AdminPanel         from './pages/AdminPanel.jsx'
import Settings           from './pages/Settings.jsx'
import ClientPortal       from './pages/ClientPortal.jsx'
import InsurerDirectory   from './pages/InsurerDirectory.jsx'
import TwoFactorChallenge from './pages/TwoFactorChallenge.jsx'

// Requires a logged-in session (aal1 is fine) — used for /2fa-challenge itself
function AuthenticatedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Full protection: requires login + 2FA verified if enrolled
function ProtectedRoute({ children, requiredRole }) {
  const { user, profile, loading, hasTOTP, mfaVerified } = useAuth()
  const location = useLocation()

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
  if (!user) return <Navigate to="/login" replace />

  // If user has TOTP enrolled but this session isn't aal2 yet, require 2FA
  if (hasTOTP && !mfaVerified) {
    return <Navigate to="/2fa-challenge" state={{ from: location.pathname }} replace />
  }

  if (requiredRole && profile?.role !== requiredRole && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function PublicRoute({ children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to={profile?.role === 'client' ? '/portal' : '/dashboard'} replace />
  return children
}

function DashboardRedirect() {
  const { profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
  if (profile?.role === 'client') return <Navigate to="/portal" replace />
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  if (supabaseMisconfigured) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-lg">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl font-bold">!</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 mb-2">Configuration Required</h1>
          <p className="text-sm text-slate-600 mb-4">
            Supabase environment variables are not set. Add <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-slate-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to your Netlify environment variables, then redeploy.
          </p>
          <p className="text-xs text-slate-400">Site configuration → Environment variables</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* 2FA challenge — requires session but not yet aal2 */}
        <Route path="/2fa-challenge" element={<AuthenticatedRoute><TwoFactorChallenge /></AuthenticatedRoute>} />

        {/* Protected — requires session + 2FA verified (if enrolled) */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/portal"     element={<ClientPortal />} />
          <Route path="/matters"    element={<Matters />} />
          <Route path="/matters/:matterId" element={<MatterDetail />} />
          <Route path="/matters/:matterId/invoices/:invoiceId" element={<InvoiceDetail />} />
          <Route path="/matters/:matterId/apportionments/:apportionmentId" element={<Apportionment />} />
          <Route path="/insurers"   element={<InsurerDirectory />} />
          <Route path="/settings"   element={<Settings />} />
          <Route path="/admin"      element={<ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<DashboardRedirect />} />
      </Routes>
    </AuthProvider>
  )
}
