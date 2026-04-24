import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../lib/mockDb.js'
import { formatCurrency } from '../lib/calculations.js'
import { FolderOpen, FileText, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

const STATUS_COLORS = {
  active:'bg-green-100 text-green-700', closed:'bg-slate-100 text-slate-600',
  pending:'bg-yellow-100 text-yellow-700', draft:'bg-slate-100 text-slate-500',
  parsed:'bg-blue-100 text-blue-700', apportioned:'bg-purple-100 text-purple-700',
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats]   = useState({ matters:0, invoices:0, apportionments:0, totalInvoiced:0 })
  const [matters, setMatters]   = useState([])
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    const org = profile?.org_id
    const m = db.getAll('matters',  { org_id: org })
    const i = db.getAll('invoices', { org_id: org })
    const a = db.getAll('apportionments', { org_id: org })
    setStats({ matters: m.length, invoices: i.length, apportionments: a.length, totalInvoiced: i.reduce((s,x)=>s+(x.total_amount||0),0) })
    setMatters(m.slice(0,5))
    setInvoices(db.getInvoicesWithMatter(org).slice(0,5))
  }, [profile])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Good {greeting}, {profile?.first_name} 👋</h1>
        <p className="text-slate-500 mt-1">Here's what's happening with your matters.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FolderOpen}  label="Active Matters"     value={stats.matters}       color="bg-brand-600" />
        <StatCard icon={FileText}    label="Invoices Processed" value={stats.invoices}       color="bg-blue-500" />
        <StatCard icon={TrendingUp}  label="Apportionments Run" value={stats.apportionments} color="bg-purple-500" />
        <StatCard icon={DollarSign}  label="Total Invoiced"     value={formatCurrency(stats.totalInvoiced)} color="bg-green-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Matters</h2>
            <Link to="/matters" className="text-brand-600 hover:text-brand-700 text-sm font-medium flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {matters.map(m => (
              <Link key={m.id} to={`/matters/${m.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.matter_number} · {format(parseISO(m.created_at), 'MMM d, yyyy')}</p>
                </div>
                <span className={`badge ${STATUS_COLORS[m.status]}`}>{m.status}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Invoices</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {invoices.map(inv => (
              <Link key={inv.id} to={`/matters/${inv.matter_id}/invoices/${inv.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-800">{inv.invoice_number} — {inv.matters?.name}</p>
                  <p className="text-xs text-slate-400">{inv.invoice_date ? format(parseISO(inv.invoice_date), 'MMM d, yyyy') : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(inv.total_amount)}</p>
                  <span className={`badge ${STATUS_COLORS[inv.status]}`}>{inv.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 card p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link to="/matters" className="btn-primary"><Plus className="h-4 w-4" /> New Matter</Link>
          <Link to="/matters" className="btn-secondary"><FileText className="h-4 w-4" /> Upload Invoice</Link>
        </div>
      </div>
    </div>
  )
}
