import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../lib/mockDb.js'
import { formatCurrency, apportionInvoice } from '../lib/calculations.js'
import { ArrowLeft, Calculator, FileText, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { v4 as uuid } from 'uuid'

const STATUS_COLORS = { draft:'bg-slate-100 text-slate-500', parsed:'bg-blue-100 text-blue-700', apportioned:'bg-purple-100 text-purple-700' }

export default function InvoiceDetail() {
  const { matterId, invoiceId } = useParams()
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [invoice, setInvoice]   = useState(null)
  const [lines, setLines]       = useState([])
  const [parties, setParties]   = useState([])
  const [insurers, setInsurers] = useState([])
  const [calculating, setCalculating] = useState(false)

  useEffect(() => {
    setInvoice(db.getOne('invoices', invoiceId))
    setLines(db.getAll('invoice_line_items', { invoice_id: invoiceId }))
    setParties(db.getAll('parties', { matter_id: matterId }))
    setInsurers(db.getPolicyPeriodsWithJoins(matterId))
  }, [invoiceId, matterId])

  const handleRunApportionment = () => {
    if (parties.length === 0) { toast.error('Add parties first.'); return }
    if (!invoice?.service_start) { toast.error('Invoice needs a service period start date.'); return }

    setCalculating(true)
    setTimeout(() => {
      const partiesWithPolicies = parties.map(p => ({
        ...p,
        policy_periods: insurers.filter(pp => pp.party_id === p.id).map(pp => ({
          insurer_id: pp.insurer_id, insurer_name: pp.insurers?.name,
          policy_start: pp.policy_start, policy_end: pp.policy_end,
        }))
      }))

      const partyBreakdown = apportionInvoice(invoice, partiesWithPolicies)

      // Build the full apportionment record with nested structure for the report page
      const appId = uuid()
      const fullApp = {
        id: appId,
        invoice_id: invoiceId,
        matter_id: matterId,
        org_id: profile.org_id,
        calculation_method: 'pro_rata_time_on_risk',
        calculated_at: new Date().toISOString(),
        notes: 'Auto-calculated: pro-rata time-on-risk',
        invoices: { invoice_number: invoice.invoice_number, total_amount: invoice.total_amount, invoice_date: invoice.invoice_date, billing_firm: invoice.billing_firm, service_start: invoice.service_start, service_end: invoice.service_end },
        matters: db.getOne('matters', matterId),
        result_json: { invoice_total: invoice.total_amount, service_start: invoice.service_start, service_end: invoice.service_end },
        party_apportionments: partyBreakdown.map((pb, i) => {
          const paId = uuid()
          return {
            id: paId,
            percentage: pb.share_percentage,
            amount: pb.party_amount,
            parties: { name: pb.party_name, type: parties.find(p=>p.id===pb.party_id)?.type || 'defendant' },
            insurer_apportionments: pb.insurers.map(ins => ({
              id: uuid(),
              days_on_risk: ins.days_on_risk,
              total_days: ins.total_exposure_days,
              percentage: ins.normalized_percentage,
              amount: ins.amount,
              insurers: { name: ins.insurer_name, policy_number: insurers.find(pp=>pp.insurer_id===ins.insurer_id)?.insurers?.policy_number || '' },
              insurer_policy_periods: { policy_start: ins.policy_start, policy_end: ins.policy_end }
            }))
          }
        })
      }

      // Persist
      const existing = (JSON.parse(localStorage.getItem('apportionments'))||[])
      existing.unshift(fullApp)
      localStorage.setItem('apportionments', JSON.stringify(existing))

      // Update invoice status
      db.update('invoices', invoiceId, { status: 'apportioned' })

      toast.success('Apportionment calculated!')
      setCalculating(false)
      navigate(`/matters/${matterId}/apportionments/${appId}`)
    }, 1200)
  }

  if (!invoice) return <div className="p-8 text-center text-slate-400">Loading…</div>

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link to={`/matters/${matterId}`} className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3">
          <ArrowLeft className="h-3 w-3"/> Back to Matter
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Invoice {invoice.invoice_number || '#'}</h1>
            <p className="text-slate-500 text-sm mt-1">{invoice.billing_firm} · {invoice.invoice_date ? format(parseISO(invoice.invoice_date),'MMMM d, yyyy') : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge ${STATUS_COLORS[invoice.status]||'bg-slate-100 text-slate-500'} text-sm px-3 py-1`}>{invoice.status}</span>
            <button onClick={handleRunApportionment} className="btn-primary" disabled={calculating}>
              {calculating ? <><Loader2 className="h-4 w-4 animate-spin"/> Calculating…</> : <><Calculator className="h-4 w-4"/> Run Apportionment</>}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          ['Total Amount', formatCurrency(invoice.total_amount)],
          ['Service Start', invoice.service_start ? format(parseISO(invoice.service_start),'MM/dd/yyyy') : '—'],
          ['Service End',   invoice.service_end   ? format(parseISO(invoice.service_end),  'MM/dd/yyyy') : '—'],
          ['Line Items', lines.length],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
            <p className="text-base font-bold text-slate-900 mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Line Items */}
      <div className="card overflow-hidden mb-6">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Line Items</h2>
          <p className="text-sm text-slate-400">{lines.length} entries · {formatCurrency(invoice.total_amount)} total</p>
        </div>
        {lines.length === 0 ? (
          <div className="p-8 text-center text-slate-400"><FileText className="h-8 w-8 mx-auto mb-2 text-slate-300"/><p>No line items.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 bg-slate-50">{['Date','Description','Timekeeper','Hours','Rate','Amount','Category'].map(h=><th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 ${h==='Amount'||h==='Hours'||h==='Rate'?'text-right':'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map(li => (
                  <tr key={li.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{li.date_of_service ? format(parseISO(li.date_of_service),'MM/dd/yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-sm"><p className="line-clamp-2">{li.description}</p></td>
                    <td className="px-4 py-3 text-sm text-slate-500">{li.timekeeper||'—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{li.hours ? li.hours.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{li.rate ? formatCurrency(li.rate) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(li.amount)}</td>
                    <td className="px-4 py-3"><span className="badge bg-slate-100 text-slate-600 capitalize">{li.category}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50"><td colSpan={5} className="px-4 py-3 font-semibold text-slate-700 text-sm">Total</td><td className="px-4 py-3 text-right font-bold text-brand-700">{formatCurrency(invoice.total_amount)}</td><td/></tr></tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Party preview */}
      {parties.length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Configured Party Shares</h2>
          <div className="flex flex-wrap gap-3">
            {parties.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                <span className="text-brand-600 font-semibold text-sm">{p.share_percentage}%</span>
                <span className="text-slate-400 text-xs">→ {formatCurrency((p.share_percentage/100)*invoice.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
