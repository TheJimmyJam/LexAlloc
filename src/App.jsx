import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth.jsx'
import Layout from './components/Layout.jsx'
import Landing        from './pages/Landing.jsx'
import Login          from './pages/Login.jsx'
import Dashboard      from './pages/Dashboard.jsx'
import Matters        from './pages/Matters.jsx'
import MatterDetail   from './pages/MatterDetail.jsx'
import InvoiceDetail  from './pages/InvoiceDetail.jsx'
import Apportionment  from './pages/Apportionment.jsx'
import AdminPanel     from './pages/AdminPanel.jsx'
import Settings       from './pages/Settings.jsx'

function Protected({ children, adminOnly }) {
  const { profile, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"/></div>
  if (!profile) return <Navigate to="/login" replace />
  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

function PublicOnly({ children }) {
  const { profile, loading } = useAuth()
  if (loading) return null
  if (profile) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/"      element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route path="/dashboard"  element={<Dashboard />} />
          <Route path="/matters"    element={<Matters />} />
          <Route path="/matters/:matterId" element={<MatterDetail />} />
          <Route path="/matters/:matterId/invoices/:invoiceId" element={<InvoiceDetail />} />
          <Route path="/matters/:matterId/apportionments/:apportionmentId" element={<Apportionment />} />
          <Route path="/admin"    element={<Protected adminOnly><AdminPanel /></Protected>} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  )
}
