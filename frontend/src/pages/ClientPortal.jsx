import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/calculations.js'
import { DollarSign, FileText, TrendingUp, AlertCircle, CheckCircle, Clock, Shield } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  pending:        'bg-slate-100 text-slate-600',
  demanded:       'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  disputed:       'bg-red-100 text-red-700',
}
const STATUS_LABELS = {
  pending: 'Pending', demanded: 'Demanded', paid: 'Paid',
  partially_paid: 'Partial', disputed: 'Disputed',
}

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

export default function ClientPortal() {
  const { profile } = useAuth()
  const qc = useQueryClient()

  // Step 1: get all insurer apportionments for this insurer
  const { data: obligations = [], isLoading } = useQuery({
    queryKey: ['client-obligations', profile?.insurer_id],
    enabled: !!profile?.insurer_id,
    queryFn: async () => {
      const { data: iaRows, error } = await supabase
        .from('la_insurer_apportionments')
        .select(`
          id, amount, amount_paid, payment_status, payment_date, demanded_at, payment_notes,
          apportionment_id,
          policy_period:la_insurer_policy_periods(claim_number, policy_start, policy_end, policy_limit)
        `)
        .eq('insurer_id', profile.insurer_id)
      if (error) throw error
      if (!iaRows?.length) return []

      // Step 2: get apportionment context (matter + invoice)
      const apptIds = [...new Set(iaRows.map(r => r.apportionment_id).filter(Boolean))]
      const { data: appts } = await supabase
        .from('la_apportionments')
        .select(`
          id,
          matters:la_matters(id, name, matter_number),
          invoices:la_invoices(invoice_number, invoice_date, service_start, service_end, total_amount)
        `)
        .in('id', apptIds)

      const apptMap = {}
      ;(appts || []).forEach(a => { apptMap[a.id] = a })

      return iaRows.map(ia => ({
        ...ia,
        matter:  apptMap[ia.apportionment_id]?.matters  || null,
        invoice: apptMap[ia.apportionment_id]?.invoices || null,
      }))
    }
  })

  // Fetch insurer name
  const { data: insurer } = useQuery({
    queryKey: ['insurer-name', profile?.insurer_id],
    enabled: !!profile?.insurer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurers')
        .select('name')
        .eq('id', profile.insurer_id)
        .single()
      return data
    }
  })

  const updatePaymentStatus = async (iaId, payment_status) => {
    const { error } = await supabase
      .from('la_insurer_apportionments')
      .update({ payment_status, ...(payment_status === 'paid' ? { amount_paid: obligations.find(o => o.id === iaId)?.amount, payment_date: new Date().toISOString().split('T')[0] } : {}) })
      .eq('id', iaId)
    if (error) { toast.error(error.message); return }
    toast.success('Status updated')
    qc.invalidateQueries({ queryKey: ['client-obligations', profile?.insurer_id] })
  }

  if (!profile?.insurer_id) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-16 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="h-7 w-7 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 mb-2">No Insurer Assigned</h2>
        <p className="text-slate-500 text-sm">Your account hasn't been linked to an insurer yet. Contact your administrator to complete setup.</p>
      </div>
    )
  }

  const totalOwed      = obligations.reduce((s, o) => s + (o.amount || 0), 0)
  const totalPaid      = obligations.reduce((s, o) => s + (o.amount_paid || 0), 0)
  const totalOutstanding = totalOwed - totalPaid
  const matters        = new Set(obligations.map(o => o.matter?.id).filter(Boolean))

  // Group by matter for display
  const byMatter = {}
  obligations.forEach(o => {
    const key = o.matter?.id || 'unknown'
    if (!byMatter[key]) byMatter[key] = { matter: o.matter, rows: [] }
    byMatter[key].rows.push(o)
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-brand-600" />
          <h1 className="text-2xl font-bold text-slate-900">{insurer?.name || 'Insurer'} Portal</h1>
        </div>
        <p className="text-slate-500 text-sm">Your payment obligations across all matters</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={DollarSign}  label="Total Owed"      value={formatCurrency(totalOwed)}        color="bg-brand-600" />
        <StatCard icon={CheckCircle} label="Total Paid"      value={formatCurrency(totalPaid)}        color="bg-green-500" />
        <StatCard icon={TrendingUp}  label="Outstanding"     value={formatCurrency(totalOutstanding)} color={totalOutstanding > 0 ? 'bg-amber-500' : 'bg-green-500'} />
        <StatCard icon={FileText}    label="Matters Involved" value={matters.size}                    color="bg-purple-500" />
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400">Loading obligations…</div>
      ) : obligations.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">
          <Shield className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No obligations yet</p>
          <p className="text-sm mt-1">Apportionments haven't been run on any matters involving your policies.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.values(byMatter).map(({ matter, rows }) => {
            const mOwed = rows.reduce((s, r) => s + (r.amount || 0), 0)
            const mPaid = rows.reduce((s, r) => s + (r.amount_paid || 0), 0)
            return (
              <div key={matter?.id || 'unknown'} className="card overflow-hidden">
                {/* Matter header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                  <div>
                    <h2 className="font-semibold text-slate-900">{matter?.name || 'Unknown Matter'}</h2>
                    {matter?.matter_number && (
                      <p className="text-xs text-slate-400 mt-0.5">#{matter.matter_number}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-800">{formatCurrency(mOwed)} owed</p>
                    <p className="text-xs text-slate-400">{formatCurrency(mPaid)} paid</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Invoice</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Service Period</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Claim #</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Owed</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Paid</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Payment Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(row => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-slate-800">{row.invoice?.invoice_number || '—'}</p>
                            {row.invoice?.invoice_date && (
                              <p className="text-xs text-slate-400">{format(parseISO(row.invoice.invoice_date), 'MMM d, yyyy')}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {row.invoice?.service_start && row.invoice?.service_end
                              ? `${format(parseISO(row.invoice.service_start), 'MM/dd/yy')} — ${format(parseISO(row.invoice.service_end), 'MM/dd/yy')}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-mono text-slate-500">
                            {row.policy_period?.claim_number || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(row.amount)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-700">
                            {row.amount_paid > 0 ? formatCurrency(row.amount_paid) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={row.payment_status || 'pending'}
                              onChange={e => updatePaymentStatus(row.id, e.target.value)}
                              className={`badge border-0 cursor-pointer text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COLORS[row.payment_status] || STATUS_COLORS.pending}`}
                            >
                              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {row.payment_date ? format(parseISO(row.payment_date), 'MM/dd/yyyy') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-slate-700">Matter Total</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(mOwed)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(mPaid)}</td>
                        <td colSpan={2} className="px-4 py-3 text-sm text-slate-500">
                          Outstanding: <span className={`font-semibold ${mOwed - mPaid > 0 ? 'text-amber-600' : 'text-green-600'}`}>{formatCurrency(mOwed - mPaid)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
