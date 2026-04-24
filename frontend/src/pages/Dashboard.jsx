import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { FolderOpen, FileText, DollarSign, TrendingUp, Plus, ArrowRight } from 'lucide-react'
import { formatCurrency } from '../lib/calculations.js'
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

export default function Dashboard() {
  const { profile } = useAuth()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const [mattersRes, invoicesRes, apportRes] = await Promise.all([
        supabase.from('la_matters').select('id', { count: 'exact' }).eq('org_id', profile.org_id),
        supabase.from('la_invoices').select('id, total_amount', { count: 'exact' }).eq('org_id', profile.org_id),
        supabase.from('la_apportionments').select('id', { count: 'exact' }).eq('org_id', profile.org_id),
      ])
      const totalInvoiced = invoicesRes.data?.reduce((s, i) => s + (i.total_amount || 0), 0) || 0
      return {
        matters:       mattersRes.count || 0,
        invoices:      invoicesRes.count || 0,
        apportionments: apportRes.count || 0,
        totalInvoiced,
      }
    }
  })

  const { data: recentMatters } = useQuery({
    queryKey: ['recent-matters', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matters')
        .select('id, name, matter_number, status, created_at')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    }
  })

  const { data: recentInvoices } = useQuery({
    queryKey: ['recent-invoices', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_invoices')
        .select('id, invoice_number, invoice_date, total_amount, status, matter_id, matters(name)')
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
        .limit(5)
      return data || []
    }
  })

  const statusColors = {
    active:   'bg-green-100 text-green-700',
    closed:   'bg-slate-100 text-slate-600',
    pending:  'bg-yellow-100 text-yellow-700',
    draft:    'bg-slate-100 text-slate-500',
    parsed:   'bg-blue-100 text-blue-700',
    apportioned: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          {profile?.first_name || 'there'} 👋
        </h1>
        <p className="text-slate-500 mt-1">Here's what's happening with your matters.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={FolderOpen}   label="Active Matters"     value={stats?.matters || 0}       color="bg-brand-600" />
        <StatCard icon={FileText}     label="Invoices Processed" value={stats?.invoices || 0}       color="bg-blue-500" />
        <StatCard icon={TrendingUp}   label="Apportionments Run" value={stats?.apportionments || 0} color="bg-purple-500" />
        <StatCard icon={DollarSign}   label="Total Invoiced"     value={formatCurrency(stats?.totalInvoiced)} color="bg-green-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Matters */}
        <div className="card">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Matters</h2>
            <Link to="/matters" className="text-brand-600 hover:text-brand-700 text-sm font-medium flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentMatters?.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">
                No matters yet.{' '}
                <Link to="/matters" className="text-brand-600 hover:underline">Create your first matter</Link>
              </div>
            )}
            {recentMatters?.map((m) => (
              <Link key={m.id} to={`/matters/${m.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.matter_number || 'No number'} · {format(parseISO(m.created_at), 'MMM d, yyyy')}</p>
                </div>
                <span className={`badge ${statusColors[m.status] || 'bg-slate-100 text-slate-500'}`}>{m.status}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Invoices */}
        <div className="card">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-900">Recent Invoices</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {recentInvoices?.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">No invoices uploaded yet.</div>
            )}
            {recentInvoices?.map((inv) => (
              <Link key={inv.id} to={`/matters/${inv.matter_id}/invoices/${inv.id}`}
                className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {inv.invoice_number || 'Invoice'} — {inv.matters?.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {inv.invoice_date ? format(parseISO(inv.invoice_date), 'MMM d, yyyy') : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{formatCurrency(inv.total_amount)}</p>
                  <span className={`badge ${statusColors[inv.status] || 'bg-slate-100 text-slate-500'}`}>{inv.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
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
