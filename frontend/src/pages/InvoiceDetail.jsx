import { useState, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { formatCurrency, apportionInvoice } from '../lib/calculations.js'
import { ArrowLeft, Calculator, FileText, ExternalLink, Loader2, GitCompare, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, AlertTriangle, Sparkles, Info } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'
import { logAudit } from '../lib/audit.js'

const METHODS = [
  {
    value: 'pro_rata_time_on_risk',
    label: 'Pro-Rata TOR',
    description: 'Days each policy was on-risk during the service period',
  },
  {
    value: 'equal_shares',
    label: 'Equal Shares',
    description: 'Splits costs evenly across all carriers for each party',
  },
  {
    value: 'limits_proportional',
    label: 'Limits-Proportional',
    description: 'Weighted by each policy\'s limit',
  },
]

export default function InvoiceDetail() {
  const { matterId, invoiceId } = useParams()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [calculating, setCalculating]   = useState(false)
  const [calcMethod, setCalcMethod]     = useState('pro_rata_time_on_risk')
  const [showComparison, setShowComparison] = useState(false)

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const { data } = await supabase.from('la_invoices').select('*, la_matters(name)').eq('id', invoiceId).single()
      return data
    }
  })

  const { data: lineItems = [] } = useQuery({
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
        .select('*, la_insurers(name)')
        .eq('matter_id', matterId)
      return data || []
    }
  })

  const [showDupeApportWarning, setShowDupeApportWarning] = useState(false)
  const [existingApportionments, setExistingApportionments] = useState([])
  const [aiRec,     setAiRec]     = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOpen,    setAiOpen]    = useState(false)

  const handleRunApportionment = async (force = false) => {
    if (parties.length === 0) { toast.error('Add parties before running apportionment.'); return }
    if (!invoice?.service_start) { toast.error('Invoice is missing a service period start date.'); return }

    // ── Dupe check: any apportionment already exists for this invoice ────────
    if (!force) {
      const { data: existing } = await supabase
        .from('la_apportionments')
        .select('id, calculation_method, calculated_at')
        .eq('invoice_id', invoiceId)
        .order('calculated_at', { ascending: false })
      if (existing?.length) {
        setExistingApportionments(existing)
        setShowDupeApportWarning(true)
        return
      }
    }
    setShowDupeApportWarning(false)
    setExistingApportionments([])

    setCalculating(true)
    try {
      const result = apportionInvoice(invoice, partiesWithPolicies, calcMethod)

      const methodLabel = METHODS.find(m => m.value === calcMethod)?.label || calcMethod

      // Save apportionment to DB
      const { data: apport, error: aErr } = await supabase.from('la_apportionments').insert({
        invoice_id:         invoiceId,
        matter_id:          matterId,
        org_id:             profile.org_id,
        calculation_method: calcMethod,
        result_json:        result,
        calculated_at:      new Date().toISOString(),
        notes:              `Auto-calculated: ${methodLabel}`,
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
            apportionment_id:       apport.id,
            party_apportionment_id: pa.id,
            insurer_id:             ins.insurer_id,
            days_on_risk:           ins.days_on_risk ?? null,
            total_days:             ins.total_coverage_days ?? null,
            percentage:             ins.normalized_percentage,
            amount:                 ins.amount,
          })
        }
      }

      // Update invoice status
      await supabase.from('la_invoices').update({ status: 'apportioned' }).eq('id', invoiceId)

      logAudit({ profile, matterId, action: 'apportionment.calculated', entityType: 'apportionment', entityId: apport.id, entityName: invoice?.invoice_number || 'Invoice', metadata: { method: calcMethod, invoice_total: invoice?.total_amount, party_count: result.party_breakdown?.length } })
      toast.success('Apportionment calculated!')

      // Fire-and-forget notification
      api.sendEvent('apportionment_run', profile.org_id, matterId, {
        invoice_number:   invoice?.invoice_number,
        method:           calcMethod,
        apportionment_id: apport.id,
      }).catch(() => {})

      qc.invalidateQueries({ queryKey: ['matter-apportionments', matterId] })
      navigate(`/matters/${matterId}/apportionments/${apport.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCalculating(false)
    }
  }

  // ── AI Method Advisor ─────────────────────────────────────────────────────
  const fetchAiRecommendation = async () => {
    setAiLoading(true)
    setAiOpen(true)
    try {
      const parties = partiesWithPolicies.map(p => ({
        name:       p.name,
        share_pct:  p.share_percentage,
        policy_periods: (p.policy_periods || []).map(pp => ({
          insurer_name: pp.insurer_name,
          start:        pp.policy_start,
          end:          pp.policy_end,
          limit_usd:    pp.policy_limit,
        })),
      }))

      const context = {
        matter_name:    invoice.la_matters?.name,
        invoice_total:  invoice.total_amount,
        service_start:  invoice.service_start,
        service_end:    invoice.service_end,
        carriers_count: parties.flatMap(p => p.policy_periods).length,
        parties,
      }

      const result = await api.recommendMethod(context)
      setAiRec(result)
    } catch (err) {
      toast.error('AI analysis failed: ' + (err.message || 'Unknown error'))
    } finally {
      setAiLoading(false)
    }
  }

  // Build parties+policies structure.
  // Party-level share = pro-rata days each party's "Dates of Service Responsible"
  // overlaps the invoice service period. Shares are normalized to 100% across all
  // included parties. Insurer-level allocation uses the selected calcMethod.
  // A party with no responsible dates is treated as covering the full service period.
  const { partiesWithPolicies, excludedParties } = useMemo(() => {
    const allPolicies = (p) => insurerPeriods
      .filter(pp => pp.party_id === p.id)
      .map(pp => ({
        insurer_id:   pp.insurer_id,
        insurer_name: pp.la_insurers?.name,
        policy_start: pp.policy_start,
        policy_end:   pp.policy_end,
        policy_limit: pp.policy_limit,
      }))

    if (!invoice?.service_start) return { partiesWithPolicies: [], excludedParties: [] }

    const invoiceStart     = parseISO(invoice.service_start)
    const invoiceEnd       = invoice.service_end ? parseISO(invoice.service_end) : invoiceStart
    const totalServiceDays = Math.max(1, differenceInCalendarDays(invoiceEnd, invoiceStart))

    // Returns how many days of this party's responsible range fall inside the invoice period.
    // No dates = responsible for the entire service period.
    const calcOverlapDays = (party) => {
      if (!party.responsible_start && !party.responsible_end) return totalServiceDays
      const pStart = party.responsible_start ? parseISO(party.responsible_start) : invoiceStart
      const pEnd   = party.responsible_end   ? parseISO(party.responsible_end)   : invoiceEnd
      const oStart = pStart > invoiceStart ? pStart : invoiceStart
      const oEnd   = pEnd   < invoiceEnd   ? pEnd   : invoiceEnd
      return Math.max(0, differenceInCalendarDays(oEnd, oStart))
    }

    const withDays = parties.map(p => ({ ...p, _overlapDays: calcOverlapDays(p) }))
    const included = withDays.filter(p => p._overlapDays > 0)
    const excluded = withDays.filter(p => p._overlapDays === 0)

    // Normalize so all included party shares sum to 100%
    const totalOverlapDays = included.reduce((s, p) => s + p._overlapDays, 0) || 1

    const partiesWithPolicies = included.map(p => ({
      ...p,
      share_percentage: parseFloat(((p._overlapDays / totalOverlapDays) * 100).toFixed(4)),
      policy_periods: allPolicies(p),
    }))

    return { partiesWithPolicies, excludedParties: excluded }
  }, [parties, insurerPeriods, invoice])

  // Compute all three methods for comparison (only when invoice + parties ready)
  const comparisonResults = useMemo(() => {
    if (!invoice?.service_start || partiesWithPolicies.length === 0) return null
    return {
      pro_rata_time_on_risk: apportionInvoice(invoice, partiesWithPolicies, 'pro_rata_time_on_risk'),
      equal_shares:          apportionInvoice(invoice, partiesWithPolicies, 'equal_shares'),
      limits_proportional:   apportionInvoice(invoice, partiesWithPolicies, 'limits_proportional'),
    }
  }, [invoice, partiesWithPolicies])

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
          <ArrowLeft className="h-3 w-3" /> {invoice.la_matters?.name}
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
            {excludedParties.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 max-w-xs text-left">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  <strong>{excludedParties.map(p => p.name).join(', ')}</strong>
                  {' '}excluded — 0 days overlap with invoice service period.
                  Pro-rata shares split among {partiesWithPolicies.length} active {partiesWithPolicies.length === 1 ? 'party' : 'parties'}.
                </span>
              </div>
            )}
            <button onClick={() => handleRunApportionment()} className="btn-primary" disabled={calculating}>
              {calculating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculating…</>
                : <><Calculator className="h-4 w-4" /> Run Apportionment</>}
            </button>
          </div>
        </div>
      </div>

      {/* Dupe apportionment warning */}
      {showDupeApportWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Apportionment Already Run</h3>
                <p className="text-sm text-slate-500 mt-1">
                  This invoice already has {existingApportionments.length === 1 ? 'an apportionment' : `${existingApportionments.length} apportionments`}. Running again will create an additional record.
                </p>
              </div>
            </div>
            {existingApportionments.length > 0 && (
              <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-1.5">
                {existingApportionments.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 capitalize">{a.calculation_method?.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400">{a.calculated_at ? format(parseISO(a.calculated_at), 'MM/dd/yyyy h:mm a') : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setShowDupeApportWarning(false); setExistingApportionments([]) }} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={() => handleRunApportionment(true)} className="btn-primary flex-1 justify-center bg-amber-600 hover:bg-amber-700 border-amber-600">Run Anyway</button>
            </div>
          </div>
        </div>
      )}

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

      {/* Calculation Method Selector */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">Insurer Allocation Method</h2>
        <p className="text-sm text-slate-400 mb-4">Each active party receives an equal share of the invoice. Choose how that share is then split across the party's insurer policy periods.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setCalcMethod(m.value)}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                calcMethod === m.value
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className={`font-semibold text-sm ${calcMethod === m.value ? 'text-brand-700' : 'text-slate-800'}`}>
                {m.label}
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>
            </button>
          ))}
        </div>
        {calcMethod === 'limits_proportional' && (
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg px-3 py-2">
            ⚠ Make sure policy limits are entered for all insurer policy periods — carriers without a limit will fall back to equal shares.
          </p>
        )}

        {/* ── AI Method Advisor ── */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          {!aiOpen && (
            <button
              onClick={fetchAiRecommendation}
              disabled={aiLoading || partiesWithPolicies.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-4 w-4" />
              {aiLoading ? 'Analyzing matter…' : 'AI Method Advisor — get a recommendation'}
            </button>
          )}

          {aiOpen && (
            <div className="rounded-xl border border-violet-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-violet-50 border-b border-violet-100">
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Sparkles className="h-4 w-4" />
                  AI Method Advisor
                </div>
                <div className="flex items-center gap-3">
                  {aiRec && (
                    <button onClick={fetchAiRecommendation} disabled={aiLoading} className="text-xs text-violet-500 hover:text-violet-700 font-medium">
                      Re-analyze
                    </button>
                  )}
                  <button onClick={() => setAiOpen(false)} className="text-violet-400 hover:text-violet-600">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 bg-white">
                {aiLoading && (
                  <div className="flex items-center gap-3 text-slate-500 text-sm py-3">
                    <Sparkles className="h-5 w-5 text-violet-400 animate-pulse" />
                    Analyzing matter facts, policy periods, and carrier count…
                  </div>
                )}

                {!aiLoading && !aiRec && (
                  <div className="text-center py-4">
                    <Sparkles className="h-7 w-7 text-violet-300 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">Click Re-analyze to get a defensibility assessment.</p>
                  </div>
                )}

                {!aiLoading && aiRec && (() => {
                  const METHOD_META = {
                    pro_rata_time_on_risk: { label: 'Pro-Rata Time on Risk',  color: 'bg-brand-100 text-brand-700',  border: 'border-brand-200'  },
                    equal_shares:          { label: 'Equal Shares',           color: 'bg-blue-100 text-blue-700',    border: 'border-blue-200'   },
                    limits_proportional:   { label: 'Limits Proportional',    color: 'bg-amber-100 text-amber-700',  border: 'border-amber-200'  },
                  }
                  const CONF_META = {
                    high:   { label: 'High confidence',   color: 'bg-green-100 text-green-700'  },
                    medium: { label: 'Medium confidence', color: 'bg-amber-100 text-amber-700'  },
                    low:    { label: 'Lower confidence',  color: 'bg-slate-100 text-slate-600'  },
                  }
                  const meta     = METHOD_META[aiRec.recommended_method] || { label: aiRec.recommended_method, color: 'bg-slate-100 text-slate-600', border: 'border-slate-200' }
                  const confMeta = CONF_META[aiRec.confidence] || CONF_META.medium
                  const isCurrent = aiRec.recommended_method === calcMethod

                  return (
                    <div className="space-y-3">
                      <div className={`flex items-start justify-between gap-4 p-3 rounded-xl border ${meta.border}`} style={{ backgroundColor: 'rgba(139,92,246,0.04)' }}>
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1.5">Recommended Method</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`badge text-sm font-semibold px-3 py-1 ${meta.color}`}>{meta.label}</span>
                            <span className={`badge text-xs ${confMeta.color}`}>{confMeta.label}</span>
                            {isCurrent
                              ? <span className="badge text-xs bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Selected</span>
                              : <button onClick={() => setCalcMethod(aiRec.recommended_method)} className="btn-secondary text-xs py-1 px-3">Use this method</button>
                            }
                          </div>
                        </div>
                      </div>

                      {aiRec.key_factors?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Key Factors</p>
                          <div className="space-y-1">
                            {aiRec.key_factors.map((f, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                <CheckCircle2 className="h-3.5 w-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                                {f}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Rationale</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{aiRec.rationale}</p>
                      </div>

                      {aiRec.caveats && (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800">
                          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-500" />
                          <p>{aiRec.caveats}</p>
                        </div>
                      )}

                      <p className="text-xs text-slate-400 pt-1 border-t border-slate-100">
                        AI-assisted analysis for decision support only. Final method selection is the responsibility of counsel.
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Method Comparison */}
      {comparisonResults && (
        <div className="card mb-6">
          <button
            onClick={() => setShowComparison(v => !v)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors rounded-2xl"
          >
            <div className="flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-violet-600" />
              <span className="font-semibold text-slate-900">Compare All Methods</span>
              <span className="text-xs text-slate-400">See how TOR, Equal Shares, and Limits-Proportional differ for this invoice</span>
            </div>
            {showComparison
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </button>

          {showComparison && (
            <div className="border-t border-slate-100 p-5 space-y-6">
              {METHODS.map(m => (
                <div key={m.value} className={`rounded-xl border-2 p-4 ${calcMethod === m.value ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {calcMethod === m.value && <CheckCircle2 className="h-4 w-4 text-brand-600" />}
                      <span className={`font-semibold text-sm ${calcMethod === m.value ? 'text-brand-700' : 'text-slate-800'}`}>{m.label}</span>
                      <span className="text-xs text-slate-400">{m.description}</span>
                    </div>
                    {calcMethod !== m.value && (
                      <button
                        onClick={() => setCalcMethod(m.value)}
                        className="btn-secondary text-xs py-1 px-3"
                      >
                        Use this method
                      </button>
                    )}
                    {calcMethod === m.value && (
                      <span className="text-xs font-semibold text-brand-600 bg-brand-100 px-2 py-1 rounded-full">Selected</span>
                    )}
                  </div>

                  {comparisonResults[m.value].party_breakdown.map(pb => {
                    const partyMeta = partiesWithPolicies.find(p => p.id === pb.party_id)
                    const respStart = partyMeta?.responsible_start ? format(parseISO(partyMeta.responsible_start), 'MM/dd/yyyy') : null
                    const respEnd   = partyMeta?.responsible_end   ? format(parseISO(partyMeta.responsible_end),   'MM/dd/yyyy') : null
                    const respLabel = respStart || respEnd
                      ? `${respStart ?? '…'} – ${respEnd ?? 'present'}`
                      : 'All dates'
                    return (
                    <div key={pb.party_id} className="mb-3 last:mb-0">
                      <div className="flex items-baseline justify-between mb-1.5 flex-wrap gap-x-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {pb.party_name} — {pb.share_percentage.toFixed(2)}% → {formatCurrency(pb.party_amount)}
                        </p>
                        <p className="text-xs text-slate-400">
                          <span className="font-medium text-slate-500">Responsible:</span> {respLabel}
                        </p>
                      </div>
                      {pb.insurers.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No insurers assigned</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="text-left text-xs font-medium text-slate-500 py-1.5 pr-4 w-1/3">Insurer</th>
                                {m.value === 'pro_rata_time_on_risk' && (
                                  <th className="text-right text-xs font-medium text-slate-500 py-1.5 pr-4">Days on Risk</th>
                                )}
                                {m.value === 'limits_proportional' && (
                                  <th className="text-right text-xs font-medium text-slate-500 py-1.5 pr-4">Policy Limit</th>
                                )}
                                <th className="text-right text-xs font-medium text-slate-500 py-1.5 pr-4">Share %</th>
                                <th className="text-right text-xs font-medium text-slate-500 py-1.5">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pb.insurers.map((ins, idx) => {
                                // Find policy limit for this insurer (for limits_proportional display)
                                const pp = insurerPeriods.find(p => p.insurer_id === ins.insurer_id && p.party_id === pb.party_id)
                                return (
                                  <tr key={idx} className="border-b border-slate-100 last:border-0">
                                    <td className="py-1.5 pr-4 font-medium text-slate-700">{ins.insurer_name}</td>
                                    {m.value === 'pro_rata_time_on_risk' && (
                                      <td className="py-1.5 pr-4 text-right text-slate-500">
                                        {ins.days_on_risk != null ? `${ins.days_on_risk} / ${ins.total_coverage_days}d` : '—'}
                                      </td>
                                    )}
                                    {m.value === 'limits_proportional' && (
                                      <td className="py-1.5 pr-4 text-right text-slate-500">
                                        {pp?.policy_limit ? formatCurrency(pp.policy_limit) : <span className="text-amber-600 text-xs">no limit</span>}
                                      </td>
                                    )}
                                    <td className="py-1.5 pr-4 text-right text-slate-600">
                                      {(ins.normalized_percentage ?? ins.percentage ?? 0).toFixed(2)}%
                                    </td>
                                    <td className="py-1.5 text-right font-semibold text-slate-800">
                                      {formatCurrency(ins.amount)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-slate-200">
                                <td colSpan={m.value === 'equal_shares' ? 2 : 3} className="py-1.5 pr-4 text-xs font-medium text-slate-500">Subtotal</td>
                                <td className="py-1.5 text-right font-bold text-slate-700">
                                  {formatCurrency(pb.insurers.reduce((s, i) => s + i.amount, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              ))}

              {/* Grand total comparison row */}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Invoice Total by Method</p>
                <div className="grid grid-cols-3 gap-3">
                  {METHODS.map(m => {
                    const total = comparisonResults[m.value].party_breakdown.reduce(
                      (s, pb) => s + pb.insurers.reduce((s2, i) => s2 + i.amount, 0), 0
                    )
                    return (
                      <div key={m.value} className={`rounded-lg p-3 text-center ${calcMethod === m.value ? 'bg-brand-50 border border-brand-200' : 'bg-slate-50 border border-slate-200'}`}>
                        <p className="text-xs text-slate-500 mb-1">{m.label}</p>
                        <p className={`font-bold text-sm ${calcMethod === m.value ? 'text-brand-700' : 'text-slate-700'}`}>
                          {formatCurrency(total)}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
      {partiesWithPolicies.length > 0 && (
        <div className="mt-6 card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Active Party Shares</h2>
            <span className="text-xs text-slate-400">Split equally among {partiesWithPolicies.length} active {partiesWithPolicies.length === 1 ? 'party' : 'parties'}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {partiesWithPolicies.map(p => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                <span className="text-brand-600 font-semibold text-sm">{p.share_percentage.toFixed(2)}%</span>
                {p._overlapDays != null && (
                  <span className="text-slate-400 text-xs">{p._overlapDays}d on risk</span>
                )}
                <span className="text-slate-400 text-xs">→ {formatCurrency((p.share_percentage / 100) * invoice.total_amount)}</span>
              </div>
            ))}
          </div>
          {excludedParties.length > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              Excluded (outside responsible dates): {excludedParties.map(p => p.name).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
