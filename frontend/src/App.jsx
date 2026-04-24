import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.js'
import Layout from './components/Layout.jsx'

// Pages
import Landing        from './pages/Landing.jsx'
import Login          from './pages/Login.jsx'
import Register       from './pages/Register.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import Dashboard      from './pages/Dashboard.jsx'
import Matters        from './pages/Matters.jsx'
import MatterDetail   from './pages/MatterDetail.jsx'
import InvoiceDetail  from './pages/InvoiceDetail.jsx'
import Apportionment  from './pages/Apportionment.jsx'
import AdminPanel     from './pages/AdminPanel.jsx'
import Settings       from './pages/Settings.jsx'

function ProtectedRoute({ children, requiredRole }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
  if (!user) return <Navigate to="/login" replace />
  if (requiredRole && profile?.role !== requiredRole && profile?.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/matters"    element={<Matters />} />
          <Route path="/matters/:matterId" element={<MatterDetail />} />
          <Route path="/matters/:matterId/invoices/:invoiceId" element={<InvoiceDetail />} />
          <Route path="/matters/:matterId/apportionments/:apportionmentId" element={<Apportionment />} />
          <Route path="/settings"   element={<Settings />} />
          <Route path="/admin"      element={<ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
