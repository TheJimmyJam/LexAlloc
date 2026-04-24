import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { formatCurrency, formatPercent, exhaustionInfo } from '../lib/calculations.js'
import { ArrowLeft, Printer, Download, ChevronDown, ChevronRight, Shield, Users, Calendar, DollarSign, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import toast from 'react-hot-toast'

const COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488']

// ── Payment helpers ───────────────────────────────────────────────────────────
const PAYMENT_STATUSES = [
  { value: 'pending',        label: 'Pending',        color: 'bg-slate-100 text-slate-600' },
  { value: 'demanded',       label: 'Demanded',       color: 'bg-amber-100 text-amber-700' },
  { value: 'paid',           label: 'Paid',           color: 'bg-green-100 text-green-700' },
  { value: 'partially_paid', label: 'Partial',        color: 'bg-blue-100 text-blue-700'   },
  { value: 'disputed',       label: 'Disputed',       color: 'bg-red-100 text-red-700'     },
]

function paymentColor(status) {
  return PAYMENT_STATUSES.find(s => s.value === status)?.color || 'bg-slate-100 text-slate-600'
}
function paymentLabel(status) {
  return PAYMENT_STATUSES.find(s => s.value === status)?.label || status
}

// ── Record Payment Modal ──────────────────────────────────────────────────────
function RecordPaymentModal({ ia, partyName, onClose, onSaved }) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      payment_status: ia.payment_status || 'pending',
      amount_paid:    ia.amount_paid    || '',
      payment_date:   ia.payment_date   || '',
      demanded_at:    ia.demanded_at    ? ia.demanded_at.split('T')[0] : '',
      payment_notes:  ia.payment_notes  || '',
    }
  })

  const status = watch('payment_status')
  const showPayment  = status === 'paid' || status === 'partially_paid'
  const showDemanded = status === 'demanded' || status === 'paid' || status === 'partially_paid' || status === 'disputed'

  const onSubmit = async (values) => {
    const { error } = await supabase
      .from('la_insurer_apportionments')
      .update({
        payment_status: values.payment_status,
        amount_paid:    parseFloat(values.amount_paid)  || 0,
        payment_date:   values.payment_date  || null,
        demanded_at:    values.demanded_at   ? new Date(values.demanded_at).toISOString() : null,
        payment_notes:  values.payment_notes || null,
      })
      .eq('id', ia.id)
    if (error) { toast.error(error.message); return }
    toast.success('Payment status updated')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg">Record Payment</h2>
            <p className="text-sm text-slate-500 mt-0.5">{ia.insurers?.name} · {partyName}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {/* Obligation context */}
          <div className="bg-slate-50 rounded-lg p-3 flex items-center justify-between text-sm">
            <span className="text-slate-500">Amount owed</span>
            <span className="font-bold text-slate-900">{formatCurrency(ia.amount)}</span>
          </div>

          <div>
            <label className="form-label">Payment Status</label>
            <select className="form-input" {...register('payment_status')}>
              {PAYMENT_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {showDemanded && (
            <div>
              <label className="form-label">Demand Date</label>
              <input type="date" className="form-input" {...register('demanded_at')} />
            </div>
          )}

          {showPayment && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Amount Paid ($)</label>
                <input type="number" step="0.01" className="form-input"
                  placeholder={formatCurrency(ia.amount).replace('$','')}
                  {...register('amount_paid')} />
              </div>
              <div>
                <label className="form-label">Payment Date</label>
                <input type="date" className="form-input" {...register('payment_date')} />
              </div>
            </div>
          )}

          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input h-20 resize-none"
              placeholder="Dispute reason, check number, partial payment details…"
              {...register('payment_notes')} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              <CheckCircle2 className="h-4 w-4" /> {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full p-5 border-b border-slate-100 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-brand-600" />
          <span className="font-semibold text-slate-900">{title}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function Apportionment() {
  const { matterId, apportionmentId } = useParams()
  const qc = useQueryClient()
  const [paymentModal, setPaymentModal] = useState(null) // { ia, partyName }

  const { data: apport, isLoading } = useQuery({
    queryKey: ['apportionment', apportionmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select(`
          *,
          invoices(invoice_number, total_amount, invoice_date, billing_firm, service_start, service_end),
          matters(name, matter_number),
          party_apportionments(
            id, percentage, amount,
            parties(name, type),
            insurer_apportionments(
              id, days_on_risk, total_days, percentage, amount,
              payment_status, amount_paid, payment_date, demanded_at, payment_notes,
              insurers(name, policy_number),
              insurer_policy_periods(policy_start, policy_end, policy_limit, deductible, claim_number, claims_rep_name, claims_rep_email, billing_address)
            )
          )
        `)
        .eq('id', apportionmentId)
        .single()
      return data
    }
  })

  const handlePrint = () => window.print()

  const handleDownloadPDF = () => {
    // Set the document title so the browser uses it as the default filename
    const prev = document.title
    const matter = apport.matters?.name || 'Matter'
    const inv    = invoice.invoice_number || 'Invoice'
    const date   = apport.calculated_at
      ? format(parseISO(apport.calculated_at), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd')
    document.title = `LexAlloc Apportionment — ${matter} — ${inv} — ${date}`
    window.print()
    document.title = prev
  }

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading apportionment…</div>
  if (!apport)   return <div className="p-8 text-center text-slate-400">Apportionment not found.</div>

  const result   = apport.result_json || {}
  const invoice  = apport.invoices || {}
  const partyApps = apport.party_apportionments || []

  // Chart data
  const pieData = partyApps.map((pa, i) => ({
    name:  pa.parties?.name || 'Unknown',
    value: pa.amount,
    color: COLORS[i % COLORS.length],
  }))

  const allInsurers = partyApps.flatMap(pa =>
    (pa.insurer_apportionments || []).map(ia => ({
      name:   `${pa.parties?.name} / ${ia.insurers?.name}`,
      amount: ia.amount,
    }))
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto print:p-0 print:max-w-none">

      {/* Print-only cover header */}
      <div className="hidden print:block print-cover mb-8">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '2px solid #4f46e5' }}>
          <div style={{ width: '32px', height: '32px', background: '#4f46e5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>L</span>
          </div>
          <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#1e293b' }}>LexAlloc</span>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#64748b' }}>
            CONFIDENTIAL — ATTORNEY WORK PRODUCT
          </span>
        </div>
        <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: '0 0 4px 0' }}>
          Apportionment Report
        </h1>
        <table style={{ width: '100%', fontSize: '11px', marginTop: '12px', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '3px 0', color: '#64748b', width: '140px' }}>Matter</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>{apport.matters?.name}{apport.matters?.matter_number ? ` (${apport.matters.matter_number})` : ''}</td>
              <td style={{ padding: '3px 0', color: '#64748b', width: '140px' }}>Invoice #</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>{invoice.invoice_number || '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0', color: '#64748b' }}>Billing Firm</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>{invoice.billing_firm || '—'}</td>
              <td style={{ padding: '3px 0', color: '#64748b' }}>Invoice Total</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>{formatCurrency(invoice.total_amount)}</td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0', color: '#64748b' }}>Service Period</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>
                {invoice.service_start ? format(parseISO(invoice.service_start), 'MM/dd/yyyy') : '—'}
                {invoice.service_end && invoice.service_end !== invoice.service_start ? ` – ${format(parseISO(invoice.service_end), 'MM/dd/yyyy')}` : ''}
              </td>
              <td style={{ padding: '3px 0', color: '#64748b' }}>Calculation Method</td>
              <td style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>
                {apport.calculation_method?.replace(/_/g, ' ')}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '3px 0', color: '#64748b' }}>Calculated</td>
              <td colSpan={3} style={{ padding: '3px 0', fontWeight: '600', color: '#1e293b' }}>
                {apport.calculated_at ? format(parseISO(apport.calculated_at), 'MMMM d, yyyy h:mm a') : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Header */}
      <div className="mb-6 print:hidden">
        <Link to={`/matters/${matterId}`}
          className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3">
          <ArrowLeft className="h-3 w-3" /> {apport.matters?.name}
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="badge bg-purple-100 text-purple-700 text-xs">Apportionment Report</div>
              <div className="badge bg-brand-100 text-brand-700 text-xs capitalize">
                {apport.calculation_method?.replace(/_/g, ' ')}
              </div>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {invoice.invoice_number || 'Invoice'} — {apport.matters?.name}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Calculated {apport.calculated_at ? format(parseISO(apport.calculated_at), 'MMMM d, yyyy h:mm a') : ''}
            </p>
          </div>
          <div className="flex gap-3 print:hidden">
            <button onClick={handlePrint} className="btn-secondary"><Printer className="h-4 w-4" /> Print</button>
            <button onClick={handleDownloadPDF} className="btn-primary"><Download className="h-4 w-4" /> Download PDF</button>
          </div>
        </div>
      </div>

      {/* Invoice Summary Banner */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl p-6 mb-6 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-brand-200 text-xs uppercase tracking-wide font-medium">Invoice Total</p>
            <p className="text-2xl font-bold mt-1">{formatCurrency(invoice.total_amount)}</p>
          </div>
          <div>
            <p className="text-brand-200 text-xs uppercase tracking-wide font-medium">Billing Firm</p>
            <p className="text-lg font-semibold mt-1">{invoice.billing_firm || '—'}</p>
          </div>
          <div>
            <p className="text-brand-200 text-xs uppercase tracking-wide font-medium">Service Period</p>
            <p className="text-base font-semibold mt-1">
              {invoice.service_start ? format(parseISO(invoice.service_start), 'MM/dd/yyyy') : '—'}
              {invoice.service_end && invoice.service_end !== invoice.service_start
                ? ` – ${format(parseISO(invoice.service_end), 'MM/dd/yyyy')}` : ''}
            </p>
          </div>
          <div>
            <p className="text-brand-200 text-xs uppercase tracking-wide font-medium">Parties</p>
            <p className="text-2xl font-bold mt-1">{partyApps.length}</p>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:hidden">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Party Apportionment</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                dataKey="value" nameKey="name" paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Insurer Obligations</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={allInsurers} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="amount" fill="#4f46e5" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-6">
        {/* Party-level breakdown */}
        <SectionCard title="Party Apportionment Summary" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Party</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Type</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Share %</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Amount</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Insurers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.map((pa) => (
                  <tr key={pa.id}>
                    <td className="py-3 font-semibold text-slate-800">{pa.parties?.name}</td>
                    <td className="py-3">
                      <span className="badge bg-slate-100 text-slate-600 capitalize">
                        {pa.parties?.type?.replace('_',' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-brand-700">{formatPercent(pa.percentage)}</td>
                    <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(pa.amount)}</td>
                    <td className="py-3 text-right text-sm text-slate-500">
                      {pa.insurer_apportionments?.length || 0} carrier{pa.insurer_apportionments?.length !== 1 ? 's' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={3} className="pt-3 font-bold text-slate-900">Total</td>
                  <td className="pt-3 text-right font-bold text-brand-700 text-lg">
                    {formatCurrency(partyApps.reduce((s, pa) => s + (pa.amount || 0), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>

        {/* Per-party insurer deep dives */}
        {partyApps.map((pa) => (
          <SectionCard
            key={pa.id}
            title={`${pa.parties?.name} — Insurer Time-on-Risk Breakdown`}
            icon={Shield}
            defaultOpen={true}
          >
            {/* Party header */}
            <div className="flex flex-wrap gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Party Share</p>
                <p className="text-xl font-bold text-brand-700 mt-0.5">{formatPercent(pa.percentage)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Party Obligation</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{formatCurrency(pa.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Service Period</p>
                <p className="text-base font-semibold text-slate-700 mt-0.5">
                  {invoice.service_start ? format(parseISO(invoice.service_start), 'MM/dd/yyyy') : '—'}
                  {invoice.service_end ? ` – ${format(parseISO(invoice.service_end), 'MM/dd/yyyy')}` : ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Exposure Days</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {pa.insurer_apportionments?.[0]?.total_days || '—'}
                </p>
              </div>
            </div>

            {(!pa.insurer_apportionments || pa.insurer_apportionments.length === 0) ? (
              <div className="text-center text-slate-400 py-4 text-sm">
                No insurer policy periods configured for this party.
                <br />The full party obligation remains with {pa.parties?.name}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Insurer</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Policy #</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Claim #</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Claims Rep</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Policy Period</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">TOR %</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Obligation</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Policy Limit</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Paid</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pa.insurer_apportionments.map((ia) => {
                      const pp        = ia.insurer_policy_periods
                      const outstanding = ia.amount - (ia.amount_paid || 0)
                      return (
                        <tr key={ia.id} className="hover:bg-slate-50">
                          <td className="py-3 font-medium text-slate-800">{ia.insurers?.name}</td>
                          <td className="py-3 text-sm font-mono text-slate-500">{ia.insurers?.policy_number || '—'}</td>
                          <td className="py-3 text-sm font-mono text-slate-600">{pp?.claim_number || '—'}</td>
                          <td className="py-3 text-sm">
                            {pp?.claims_rep_name ? (
                              <div>
                                <p className="text-slate-700 font-medium">{pp.claims_rep_name}</p>
                                {pp.claims_rep_email && (
                                  <a href={`mailto:${pp.claims_rep_email}`}
                                    className="text-xs text-brand-600 hover:underline print:text-slate-500">
                                    {pp.claims_rep_email}
                                  </a>
                                )}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-3 text-sm text-slate-600">
                            {pp ? (
                              <span>{format(parseISO(pp.policy_start), 'MM/dd/yyyy')} – {format(parseISO(pp.policy_end), 'MM/dd/yyyy')}</span>
                            ) : '—'}
                          </td>
                          <td className="py-3 text-right text-slate-600">{ia.days_on_risk} / {ia.total_days}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 bg-slate-100 rounded-full h-1.5 print:hidden">
                                <div className="bg-brand-600 h-1.5 rounded-full" style={{ width: `${Math.min(ia.percentage, 100)}%` }} />
                              </div>
                              <span className="font-bold text-brand-700">{formatPercent(ia.percentage)}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                          <td className="py-3 text-right">
                            {pp?.policy_limit ? (() => {
                              const xPct = (ia.amount / Number(pp.policy_limit)) * 100
                              const info = exhaustionInfo(xPct)
                              return (
                                <div className="flex flex-col items-end gap-0.5">
                                  <span className="text-sm text-slate-700">{formatCurrency(pp.policy_limit)}</span>
                                  {xPct >= 70 ? (
                                    <span className={`badge ${info.badge} text-xs`}>
                                      <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                                      {xPct.toFixed(0)}% this inv
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">{xPct.toFixed(0)}% of limit</span>
                                  )}
                                </div>
                              )
                            })() : <span className="text-slate-300 text-sm">—</span>}
                          </td>
                          <td className="py-3 text-right">
                            {ia.payment_status === 'paid' ? (
                              <span className="font-semibold text-green-700">{formatCurrency(ia.amount_paid)}</span>
                            ) : ia.payment_status === 'partially_paid' ? (
                              <div className="text-right">
                                <span className="font-semibold text-blue-700">{formatCurrency(ia.amount_paid)}</span>
                                <p className="text-xs text-amber-600">{formatCurrency(outstanding)} left</p>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-3 text-center print:hidden">
                            <button
                              onClick={() => setPaymentModal({ ia, partyName: pa.parties?.name })}
                              className={`badge cursor-pointer hover:opacity-80 transition-opacity ${paymentColor(ia.payment_status)}`}
                            >
                              {paymentLabel(ia.payment_status)}
                            </button>
                          </td>
                          <td className="py-3 text-center hidden print:table-cell">
                            <span className="text-xs">{paymentLabel(ia.payment_status)}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={5} className="pt-3 font-semibold text-slate-700 text-sm">Insured Subtotal</td>
                      <td className="pt-3 text-right font-bold text-brand-700">
                        {formatCurrency(pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount || 0), 0))}
                      </td>
                      <td />
                      <td className="pt-3 text-right font-bold text-green-700">
                        {formatCurrency(pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount_paid || 0), 0))}
                      </td>
                      <td />
                    </tr>
                    {pa.amount - pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount || 0), 0) > 0.01 && (
                      <tr className="bg-amber-50">
                        <td colSpan={6} className="pt-2 pb-3 text-amber-700 text-sm font-medium">
                          ⚠ Uninsured / Gap (no triggering policy)
                        </td>
                        <td colSpan={2} className="pt-2 pb-3 text-right font-bold text-amber-700">
                          {formatCurrency(pa.amount - pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount || 0), 0))}
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>
        ))}

        {/* Grand summary */}
        <SectionCard title="Grand Summary — All Parties & Insurers" icon={DollarSign}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Party</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Insurer</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">TOR %</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Party %</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Net Obligation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.flatMap((pa) =>
                  (pa.insurer_apportionments || []).map((ia) => (
                    <tr key={`${pa.id}-${ia.id}`} className="hover:bg-slate-50">
                      <td className="py-2.5 font-medium text-slate-800 text-sm">{pa.parties?.name}</td>
                      <td className="py-2.5 text-sm text-slate-600">{ia.insurers?.name}</td>
                      <td className="py-2.5 text-right text-sm text-slate-600">{ia.days_on_risk}</td>
                      <td className="py-2.5 text-right text-sm text-brand-600 font-medium">{formatPercent(ia.percentage)}</td>
                      <td className="py-2.5 text-right text-sm text-slate-500">{formatPercent(pa.percentage)}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={5} className="pt-3 font-bold text-slate-900">Invoice Total</td>
                  <td className="pt-3 text-right font-bold text-brand-700 text-xl">{formatCurrency(invoice.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          /* Typography */
          body { font-size: 10.5px !important; color: #1e293b !important; }

          /* Hide screen-only elements */
          .print\\:hidden { display: none !important; }

          /* Cards — flat borders, no shadow */
          .card {
            box-shadow: none !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 6px !important;
            break-inside: avoid;
          }

          /* Gradient banner — replace with flat */
          .bg-gradient-to-r {
            background: #4f46e5 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          /* Progress bars */
          .bg-brand-600 { background-color: #4f46e5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bg-slate-100 { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bg-slate-50  { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bg-amber-50  { background-color: #fffbeb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* Section headings — avoid breaking after */
          .card > button { page-break-after: avoid; }

          /* Tables — keep headers with rows */
          thead { display: table-header-group; }
          tr    { page-break-inside: avoid; }

          /* Section cards — try not to split across pages */
          .space-y-6 > div { break-inside: avoid; }

          /* Spacing */
          .p-6, .lg\\:p-8 { padding: 0 !important; }
          .mb-6 { margin-bottom: 16px !important; }
          .space-y-6 > * + * { margin-top: 16px !important; }
        }

        /* Print footer via counter */
        @media print {
          @page {
            @bottom-center {
              content: "LexAlloc Apportionment Report  •  Page " counter(page) " of " counter(pages);
              font-size: 9px;
              color: #94a3b8;
            }
          }
        }
      `}</style>

      {/* Payment modal */}
      {paymentModal && (
        <RecordPaymentModal
          ia={paymentModal.ia}
          partyName={paymentModal.partyName}
          onClose={() => setPaymentModal(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })}
        />
      )}
    </div>
  )
}
