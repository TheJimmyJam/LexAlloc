import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabase.js'
import { formatCurrency, apportionInvoice } from '../lib/calculations.js'
import { ArrowLeft, Calculator, FileText, ExternalLink, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

export default function InvoiceDetail() {
  const { matterId, invoiceId } = useParams()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [calculating, setCalculating] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const { data } = await supabase.from('la_invoices').select('*, matters(name)').eq('id', invoiceId).single()
      return data
    }
  })

  const { data: lineItems = [], refetch: refetchLines } = useQuery({
    queryKey: ['invoice-lines', invoiceId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('date_of_service')
      return data || []
    }
  })

  const { data: parties = [] } = useQuery({
    queryKey: ['matter-parties', matterId],
    queryFn: async () => {
      const { data } = await supabase.from('la_parties').select('*').eq('matter_id', matterId)
      return data || []
    }
  })

  const { data: insurerPeriods = [] } = useQuery({
    queryKey: ['matter-insurers', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurer_policy_periods')
        .select('*, insurers(name)')
        .eq('matter_id', matterId)
      return data || []
    }
  })

  const handleRunApportionment = async () => {
    if (parties.length === 0) { toast.error('Add parties before running apportionment.'); return }
    if (!invoice?.service_start) { toast.error('Invoice is missing a service period start date.'); return }

    setCalculating(true)
    try {
      // Build payload for calculation
      const partiesWithPolicies = parties.map(p => ({
        ...p,
        policy_periods: insurerPeriods
          .filter(pp => pp.party_id === p.id)
          .map(pp => ({
            insurer_id:   pp.insurer_id,
            insurer_name: pp.insurers?.name,
            policy_start: pp.policy_start,
            policy_end:   pp.policy_end,
          }))
      }))

      const result = apportionInvoice(invoice, partiesWithPolicies)

      // Save apportionment to DB
      const { data: apport, error: aErr } = await supabase.from('la_apportionments').insert({
        invoice_id:         invoiceId,
        matter_id:          matterId,
        org_id:             profile.org_id,
        calculation_method: 'pro_rata_time_on_risk',
        result_json:        result,
        calculated_at:      new Date().toISOString(),
        notes:              `Auto-calculated: pro-rata time-on-risk`,
      }).select().single()
      if (aErr) throw aErr

      // Save party + insurer breakdowns
      for (const pb of result.party_breakdown) {
        const { data: pa } = await supabase.from('la_party_apportionments').insert({
          apportionment_id: apport.id,
          party_id:         pb.party_id,
          percentage:       pb.share_percentage,
          amount:           pb.party_amount,
        }).select().single()

        for (const ins of pb.insurers) {
          await supabase.from('la_insurer_apportionments').insert({
            apportionment_id:      apport.id,
            party_apportionment_id: pa.id,
            insurer_id:            ins.insurer_id,
            days_on_risk:          ins.days_on_risk,
            total_days:            ins.total_exposure_days,
            percentage:            ins.normalized_percentage,
            amount:                ins.amount,
          })
        }
      }

      // Update invoice status
      await supabase.from('la_invoices').update({ status: 'apportioned' }).eq('id', invoiceId)

      toast.success('Apportionment calculated!')
      qc.invalidateQueries({ queryKey: ['matter-apportionments', matterId] })
      navigate(`/matters/${matterId}/apportionments/${apport.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCalculating(false)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading invoice…</div>
  if (!invoice)  return <div className="p-8 text-center text-slate-400">Invoice not found.</div>

  const statusColors = {
    draft: 'bg-slate-100 text-slate-500', parsed: 'bg-blue-100 text-blue-700',
    apportioned: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to={`/matters/${matterId}`} className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3">
          <ArrowLeft className="h-3 w-3" /> {invoice.matters?.name}
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Invoice {invoice.invoice_number || '#'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {invoice.billing_firm && <span className="mr-3">{invoice.billing_firm}</span>}
              {invoice.invoice_date && format(parseISO(invoice.invoice_date), 'MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`badge ${statusColors[invoice.status] || 'bg-slate-100 text-slate-500'} text-sm px-3 py-1`}>
              {invoice.status}
            </span>
            {invoice.file_url && (
              <a href={invoice.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                <ExternalLink className="h-4 w-4" /> View PDF
              </a>
            )}
            <button onClick={handleRunApportionment} className="btn-primary" disabled={calculating}>
              {calculating ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</> : <><Calculator className="h-4 w-4" /> Run Apportionment</>}
            </button>
          </div>
        </div>
      </div>

      {/* Invoice Meta */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Amount</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(invoice.total_amount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Service Start</p>
          <p className="text-base font-semibold text-slate-800 mt-1">
            {invoice.service_start ? format(parseISO(invoice.service_start), 'MM/dd/yyyy') : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Service End</p>
          <p className="text-base font-semibold text-slate-800 mt-1">
            {invoice.service_end ? format(parseISO(invoice.service_end), 'MM/dd/yyyy') : '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Line Items</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{lineItems.length}</p>
        </div>
      </div>

      {/* Line Items */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Line Items</h2>
          <p className="text-sm text-slate-400">{lineItems.length} entries</p>
        </div>
        {lineItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>No line items found. They may not have been extracted from the PDF.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Description</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Timekeeper</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Hours</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Rate</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((li) => (
                  <tr key={li.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {li.date_of_service ? format(parseISO(li.date_of_service), 'MM/dd/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-sm">
                      <p className="line-clamp-2">{li.description}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{li.timekeeper || '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{li.hours ? li.hours.toFixed(2) : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-600">{li.rate ? formatCurrency(li.rate) : '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(li.amount)}</td>
                    <td className="px-4 py-3">
                      <span className="badge bg-slate-100 text-slate-600 capitalize">{li.category}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={5} className="px-5 py-3 text-sm font-semibold text-slate-700">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-700">{formatCurrency(invoice.total_amount)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Parties summary */}
      {parties.length > 0 && (
        <div className="mt-6 card p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Party Shares (configured)</h2>
          <div className="flex flex-wrap gap-3">
            {parties.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                <span className="text-brand-600 font-semibold text-sm">{p.share_percentage}%</span>
                <span className="text-slate-400 text-xs">→ {formatCurrency((p.share_percentage / 100) * invoice.total_amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
