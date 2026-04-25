import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { useNavigate } from 'react-router-dom'
import { BarChart3, CreditCard, Zap, DollarSign, TrendingUp, Activity, ArrowRightLeft, FileText, Building2, Users } from 'lucide-react'
import { formatCurrency } from '../lib/calculations.js'

export default function Financials() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isPlatformAdmin = profile?.is_platform_admin === true

  // Redirect non-DB-Admins away
  if (profile && !isPlatformAdmin) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const { data: stats, isLoading } = useQuery({
    queryKey: ['platform-financial-stats'],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const [
        invoicesRes,
        obligationsRes,
        mattersRes,
        clientsRes,
        apportRunsRes,
        orgsRes,
      ] = await Promise.all([
        // Invoices: source of truth for billed amounts
        supabase.from('la_invoices').select('total_amount'),
        // Insurer obligations: source of truth for all payment activity (Stripe updates these)
        supabase.from('la_insurer_apportionments').select('amount, amount_paid, payment_status'),
        supabase.from('la_matters').select('id', { count: 'exact', head: true }),
        supabase.from('la_profiles').select('id', { count: 'exact', head: true }).eq('role', 'client'),
        supabase.from('la_apportionments').select('id', { count: 'exact', head: true }),
        supabase.from('la_organizations').select('id', { count: 'exact', head: true }),
      ])

      const invoices  = invoicesRes.data    || []
      const obligs    = obligationsRes.data || []

      // Total billed = sum of all invoice amounts
      const totalBilled = invoices.reduce((s, r) => s + Number(r.total_amount || 0), 0)

      // Total received = sum of amount_paid on paid + partially_paid obligations (Stripe-confirmed)
      const totalReceived = obligs
        .filter(r => r.payment_status === 'paid' || r.payment_status === 'partially_paid')
        .reduce((s, r) => s + Number(r.amount_paid || 0), 0)

      // Total owed = sum of all obligation amounts (what was apportioned)
      const totalOwed = obligs.reduce((s, r) => s + Number(r.amount || 0), 0)

      // Total outstanding = unpaid/pending/demanded obligations
      const totalOutstanding = obligs
        .filter(r => r.payment_status !== 'paid')
        .reduce((s, r) => s + Number(r.amount || 0), 0)

      const collectRate = totalOwed > 0 ? (totalReceived / totalOwed) * 100 : 0

      return {
        totalBilled,
        totalReceived,
        lexallocRevenue: totalReceived * 0.03,
        totalOwed,
        totalOutstanding,
        collectRate,
        matterCount:    mattersRes.count    ?? 0,
        clientCount:    clientsRes.count    ?? 0,
        apportRunCount: apportRunsRes.count ?? 0,
        invoiceCount:   invoices.length,
        orgCount:       orgsRes.count       ?? 0,
      }
    },
  })

  const fmt   = (v) => isLoading ? '—' : (v !== undefined ? formatCurrency(v) : '—')
  const fmtN  = (v) => isLoading ? '—' : (v !== undefined ? v.toLocaleString() : '—')
  const fmtPct = (v) => isLoading ? '—' : (v !== undefined ? `${v.toFixed(1)}%` : '—')

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financials</h1>
          <p className="text-slate-500 text-sm">Platform-wide financial overview · DB Admin only</p>
        </div>
      </div>

      {/* Revenue KPIs */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Revenue</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Received</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(stats?.totalReceived)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All paid obligations platform-wide</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">LexAlloc Revenue <span className="normal-case font-normal">(3%)</span></p>
              <p className="text-2xl font-bold text-violet-700">{fmt(stats?.lexallocRevenue)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Platform fee on processed payments</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Billed</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(stats?.totalBilled)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Sum of all invoice amounts</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Outstanding</p>
              <p className="text-2xl font-bold text-amber-700">{fmt(stats?.totalOutstanding)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Unpaid insurer obligations</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Total Owed (all time)</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(stats?.totalOwed)}</p>
              <p className="text-xs text-slate-400 mt-0.5">All apportionment obligations ever created</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Collection Rate</p>
              <p className="text-2xl font-bold text-teal-700">{fmtPct(stats?.collectRate)}</p>
              <p className="text-xs text-slate-400 mt-0.5">Received vs. total owed</p>
            </div>
          </div>

        </div>
      </div>

      {/* Platform Activity */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Platform Activity</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRightLeft className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Apportionment Runs</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{fmtN(stats?.apportRunCount)}</p>
            <p className="text-xs text-slate-400 mt-1">Total calculated</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Invoices</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{fmtN(stats?.invoiceCount)}</p>
            <p className="text-xs text-slate-400 mt-1">Processed platform-wide</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Matters</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{fmtN(stats?.matterCount)}</p>
            <p className="text-xs text-slate-400 mt-1">Active and closed</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Clients</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{fmtN(stats?.clientCount)}</p>
            <p className="text-xs text-slate-400 mt-1">Client portal users</p>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Organizations</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{fmtN(stats?.orgCount)}</p>
            <p className="text-xs text-slate-400 mt-1">Active orgs</p>
          </div>

        </div>
      </div>
    </div>
  )
}
