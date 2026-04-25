import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/calculations.js'
import {
  DollarSign, FileText, TrendingUp, AlertCircle, CheckCircle,
  Clock, Shield, CreditCard, X, ChevronDown, ChevronRight,
  Calendar, Hash, AlertTriangle, Loader2
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:        { label: 'Pending',      bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
  demanded:       { label: 'Demanded',     bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500'  },
  paid:           { label: 'Paid',         bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  partially_paid: { label: 'Partial Pay',  bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  disputed:       { label: 'Disputed',     bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, gradient, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradient} shadow-sm`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </div>
  )
}

// ── Matter card ───────────────────────────────────────────────────────────────
function MatterCard({ matter, rows, insurerName, onPay, payingId }) {
  const [expanded, setExpanded] = useState(true)
  const mOwed        = rows.reduce((s, r) => s + (r.amount      || 0), 0)
  const mPaid        = rows.reduce((s, r) => s + (r.amount_paid || 0), 0)
  const mOutstanding = mOwed - mPaid
  const allPaid      = mOutstanding <= 0
  const hasPayable   = rows.some(r => r.payment_status !== 'paid' && (r.amount || 0) > (r.amount_paid || 0))

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Matter header */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${allPaid ? 'bg-green-100' : 'bg-brand-50'}`}>
            <FileText className={`h-4 w-4 ${allPaid ? 'text-green-600' : 'text-brand-600'}`} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{matter?.name || 'Unknown Matter'}</h2>
            {matter?.matter_number && (
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Hash className="h-3 w-3" />{matter.matter_number}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Summary numbers */}
          <div className="hidden sm:flex items-center gap-6 text-right">
            <div>
              <p className="text-xs text-slate-400">Total Owed</p>
              <p className="text-sm font-bold text-slate-900">{formatCurrency(mOwed)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Paid</p>
              <p className="text-sm font-bold text-green-600">{formatCurrency(mPaid)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Outstanding</p>
              <p className={`text-sm font-bold ${allPaid ? 'text-green-600' : 'text-amber-600'}`}>
                {formatCurrency(mOutstanding)}
              </p>
            </div>
          </div>

          {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {/* Obligation rows */}
      {expanded && (
        <div>
          {/* Mobile summary */}
          <div className="sm:hidden flex gap-4 px-6 py-3 bg-slate-50 border-b border-slate-100 text-sm">
            <span className="text-slate-500">Owed: <strong className="text-slate-900">{formatCurrency(mOwed)}</strong></span>
            <span className="text-slate-500">Paid: <strong className="text-green-600">{formatCurrency(mPaid)}</strong></span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Invoice', 'Service Period', 'Policy Period', 'Claim #', 'Amount Owed', 'Amount Paid', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-5 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(row => {
                  const payable = row.payment_status !== 'paid' && (row.amount || 0) > (row.amount_paid || 0)
                  return (
                    <tr key={row.id} className={`hover:bg-slate-50 transition-colors ${row.payment_status === 'paid' ? 'opacity-75' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-800">{row.invoice?.invoice_number || '—'}</p>
                        {row.invoice?.invoice_date && (
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(parseISO(row.invoice.invoice_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {row.invoice?.service_start && row.invoice?.service_end
                          ? `${format(parseISO(row.invoice.service_start), 'MM/dd/yy')} – ${format(parseISO(row.invoice.service_end), 'MM/dd/yy')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {row.policy_period?.policy_start && row.policy_period?.policy_end
                          ? `${format(parseISO(row.policy_period.policy_start), 'MM/dd/yy')} – ${format(parseISO(row.policy_period.policy_end), 'MM/dd/yy')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-4 text-sm font-mono text-slate-500">
                        {row.policy_period?.claim_number || '—'}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="text-sm font-bold text-slate-900">{formatCurrency(row.amount)}</span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`text-sm font-bold ${row.amount_paid > 0 ? 'text-green-600' : 'text-slate-300'}`}>
                          {row.amount_paid > 0 ? formatCurrency(row.amount_paid) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={row.payment_status} />
                        {row.payment_date && (
                          <p className="text-xs text-slate-400 mt-1">{format(parseISO(row.payment_date), 'MM/dd/yyyy')}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {payable ? (
                          <button
                            onClick={() => onPay(row)}
                            disabled={payingId === row.id}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm"
                          >
                            {payingId === row.id
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
                              : <><CreditCard className="h-3.5 w-3.5" /> Pay Now</>}
                          </button>
                        ) : row.payment_status === 'paid' ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                            <CheckCircle className="h-3.5 w-3.5" /> Paid
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-slate-700">Matter Total</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 text-sm">{formatCurrency(mOwed)}</td>
                  <td className="px-4 py-3 text-right font-bold text-green-600 text-sm">{formatCurrency(mPaid)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-bold ${allPaid ? 'text-green-600' : 'text-amber-600'}`}>
                      {allPaid ? '✓ Fully Paid' : `${formatCurrency(mOutstanding)} outstanding`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {hasPayable && (
                      <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Action required
                      </span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Payment success modal ─────────────────────────────────────────────────────
function PaymentSuccessModal({ obligation, onClose }) {
  const [seconds, setSeconds] = useState(10)

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(t); onClose(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        {/* Icon */}
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="h-9 w-9 text-green-500" />
        </div>

        <h2 className="text-xl font-bold text-center text-slate-900 mb-1">Payment Successful</h2>
        <p className="text-center text-slate-500 text-sm mb-6">Your payment has been received. A confirmation email has been sent to you.</p>

        {/* Payment details */}
        {obligation && (
          <div className="bg-slate-50 rounded-xl p-4 space-y-3 mb-6 border border-slate-100">
            {obligation.matter?.name && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Matter</span>
                <span className="font-semibold text-slate-900 text-right max-w-[60%]">{obligation.matter.name}</span>
              </div>
            )}
            {obligation.invoice?.invoice_number && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Invoice</span>
                <span className="font-semibold text-slate-900">{obligation.invoice.invoice_number}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
              <span className="text-slate-500 font-medium">Amount Paid</span>
              <span className="font-bold text-green-600 text-base">{formatCurrency(obligation.amount)}</span>
            </div>
          </div>
        )}

        {/* Countdown bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(seconds / 10) * 100}%` }}
            />
          </div>
          <p className="text-xs text-center text-slate-400">Closing in {seconds}s</p>
        </div>
      </div>
    </div>
  )
}

// ── Main portal ───────────────────────────────────────────────────────────────
export default function ClientPortal() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [payingId, setPayingId] = useState(null)
  const [paymentBanner, setPaymentBanner] = useState(null)
  const [successSessionId, setSuccessSessionId] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result    = params.get('payment')
    const sessionId = params.get('session_id')
    if (result === 'success') {
      setSuccessSessionId(sessionId)
      qc.invalidateQueries({ queryKey: ['client-obligations'] })
    }
    if (result === 'cancelled') { setPaymentBanner('cancelled') }
    if (result) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const { data: obligations = [], isLoading } = useQuery({
    queryKey: ['client-obligations', profile?.insurer_id],
    enabled: !!profile?.insurer_id,
    queryFn: async () => {
      const { data: iaRows, error } = await supabase
        .from('la_insurer_apportionments')
        .select(`
          id, amount, amount_paid, payment_status, payment_date, demanded_at, payment_notes,
          stripe_session_id, stripe_payment_intent_id,
          apportionment_id,
          policy_period:la_insurer_policy_periods(claim_number, policy_start, policy_end, policy_limit)
        `)
        .eq('insurer_id', profile.insurer_id)
      if (error) throw error
      if (!iaRows?.length) return []

      const apptIds = [...new Set(iaRows.map(r => r.apportionment_id).filter(Boolean))]
      const { data: appts } = await supabase
        .from('la_apportionments')
        .select(`id, matters:la_matters(id, name, matter_number), invoices:la_invoices(invoice_number, invoice_date, service_start, service_end, total_amount)`)
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

  const { data: insurer } = useQuery({
    queryKey: ['insurer-name', profile?.insurer_id],
    enabled: !!profile?.insurer_id,
    queryFn: async () => {
      const { data } = await supabase.from('la_insurers').select('name').eq('id', profile.insurer_id).single()
      return data
    }
  })

  const handlePayOnline = async (obligation) => {
    setPayingId(obligation.id)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { obligation_id: obligation.id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (data?.url) window.location.href = data.url
    } catch (err) {
      toast.error(err.message || 'Failed to start payment')
      setPayingId(null)
    }
  }

  // ── No insurer assigned ────────────────────────────────────────────────────
  if (!profile?.insurer_id) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-md text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-7 w-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Account Setup Incomplete</h2>
          <p className="text-slate-500 text-sm leading-relaxed">Your portal account hasn't been linked to an insurer yet. Contact your LexAlloc administrator to complete setup.</p>
        </div>
      </div>
    )
  }

  const totalOwed        = obligations.reduce((s, o) => s + (o.amount      || 0), 0)
  const totalPaid        = obligations.reduce((s, o) => s + (o.amount_paid || 0), 0)
  const totalOutstanding = totalOwed - totalPaid
  const matters          = new Set(obligations.map(o => o.matter?.id).filter(Boolean))
  const pendingCount     = obligations.filter(o => o.payment_status !== 'paid' && (o.amount || 0) > (o.amount_paid || 0)).length

  const byMatter = {}
  obligations.forEach(o => {
    const key = o.matter?.id || 'unknown'
    if (!byMatter[key]) byMatter[key] = { matter: o.matter, rows: [] }
    byMatter[key].rows.push(o)
  })

  const successObligation = successSessionId
    ? obligations.find(o => o.stripe_session_id === successSessionId) ?? null
    : null

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Payment success modal ──────────────────────────────────────────── */}
      {successSessionId && (
        <PaymentSuccessModal
          obligation={successObligation}
          onClose={() => setSuccessSessionId(null)}
        />
      )}

      {/* ── Portal header ──────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Insurer Portal</p>
              <h1 className="text-xl font-bold text-white">{insurer?.name || 'Loading…'}</h1>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              {pendingCount} obligation{pendingCount !== 1 ? 's' : ''} requiring payment
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">

        {/* Payment result banners */}
        {paymentBanner === 'cancelled' && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 shadow-sm">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-amber-800 text-sm">Payment was cancelled. Your obligation status has not changed.</p>
            </div>
            <button onClick={() => setPaymentBanner(null)} className="text-amber-400 hover:text-amber-600 ml-4"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={DollarSign}  label="Total Owed"       value={formatCurrency(totalOwed)}        gradient="from-brand-500 to-brand-700" />
          <StatCard icon={CheckCircle} label="Total Paid"       value={formatCurrency(totalPaid)}        gradient="from-emerald-400 to-emerald-600" />
          <StatCard icon={TrendingUp}  label="Outstanding"      value={formatCurrency(totalOutstanding)} gradient={totalOutstanding > 0 ? 'from-amber-400 to-amber-600' : 'from-emerald-400 to-emerald-600'} sub={totalOutstanding > 0 ? 'Action required' : 'All clear'} />
          <StatCard icon={FileText}    label="Matters"          value={matters.size}                     gradient="from-violet-400 to-violet-600" sub={`${obligations.length} obligation${obligations.length !== 1 ? 's' : ''} total`} />
        </div>

        {/* Obligations by matter */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-slate-300" />
            <p className="font-medium">Loading your obligations…</p>
          </div>
        ) : obligations.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center shadow-sm">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Shield className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700 text-lg mb-1">No obligations yet</p>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">Apportionments haven't been run on any matters involving your policies. Check back after your administrator processes invoices.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Object.values(byMatter).map(({ matter, rows }) => (
              <MatterCard
                key={matter?.id || 'unknown'}
                matter={matter}
                rows={rows}
                insurerName={insurer?.name}
                onPay={handlePayOnline}
                payingId={payingId}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
