import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/calculations.js'
import { format, parseISO } from 'date-fns'
import {
  Scale, Plus, Edit2, Check, X, AlertTriangle,
  TrendingDown, ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-700',
  final: 'bg-green-100 text-green-700',
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-slate-900' }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function pct(num, denom) {
  if (!denom || denom === 0) return null
  return Math.round((num / denom) * 100)
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SettlementTab({ matter, insurerPeriods, parties }) {
  const matterId = matter?.id
  const orgId    = matter?.org_id
  const qc       = useQueryClient()

  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState(null)
  const [formData,   setFormData]   = useState(null)

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: settlement, isLoading } = useQuery({
    queryKey: ['settlement', matterId],
    enabled:  !!matterId,
    queryFn:  async () => {
      const { data } = await supabase
        .from('la_settlements')
        .select(`
          id, settlement_date, total_amount, status, notes, created_at,
          allocations:la_settlement_allocations(
            id, original_demand, reserve_amount, settlement_amount, notes,
            insurer_policy_period_id,
            insurer:la_insurers(name),
            policy_period:la_insurer_policy_periods(policy_limit, policy_start, policy_end),
            party:la_parties(name)
          )
        `)
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  // Aggregate total demanded per insurer_policy_period_id across all apportionments
  const { data: demandMap = {} } = useQuery({
    queryKey: ['matter-demand-map', matterId],
    enabled:  !!matterId,
    queryFn:  async () => {
      const { data: apports } = await supabase
        .from('la_apportionments')
        .select('id')
        .eq('matter_id', matterId)
      if (!apports?.length) return {}
      const apportIds = apports.map(a => a.id)
      const { data: ia } = await supabase
        .from('la_insurer_apportionments')
        .select('insurer_policy_period_id, amount, amount_paid, payment_status')
        .in('apportionment_id', apportIds)
      if (!ia?.length) return {}
      const map = {}
      ia.forEach(row => {
        const key = row.insurer_policy_period_id
        if (!key) return
        if (!map[key]) map[key] = { demanded: 0, paid: 0 }
        map[key].demanded += Number(row.amount      || 0)
        map[key].paid     += Number(row.amount_paid || 0)
      })
      return map
    },
  })

  // ── Summary stats ────────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    if (!settlement?.allocations?.length) return null
    const totalDemanded = settlement.allocations.reduce((s, a) => s + Number(a.original_demand  || 0), 0)
    const totalSettled  = settlement.allocations.reduce((s, a) => s + Number(a.settlement_amount || 0), 0)
    const totalReserve  = settlement.allocations.reduce((s, a) => s + Number(a.reserve_amount    || 0), 0)
    const savings       = totalDemanded - totalSettled
    return { totalDemanded, totalSettled, totalReserve, savings }
  }, [settlement])

  // ── Form helpers ─────────────────────────────────────────────────────────────
  const buildInitAllocations = (existingMap = {}) =>
    insurerPeriods.map(pp => {
      const ex = existingMap[pp.id]
      return {
        insurer_policy_period_id: pp.id,
        insurer_id:    pp.insurer_id,
        party_id:      pp.party_id,
        insurer_name:  pp.insurers?.name  || 'Unknown Insurer',
        party_name:    pp.parties?.name   || '—',
        policy_limit:  pp.policy_limit    || 0,
        original_demand:  ex ? Number(ex.original_demand)  : (demandMap[pp.id]?.demanded || 0),
        reserve_amount:   ex ? String(ex.reserve_amount)   : '',
        settlement_amount: ex ? String(ex.settlement_amount) : '',
        notes:            ex?.notes || '',
        id:               ex?.id,
      }
    })

  const openCreate = () => {
    setFormData({
      settlement_date: format(new Date(), 'yyyy-MM-dd'),
      total_amount:    '',
      status:          'draft',
      notes:           '',
      allocations:     buildInitAllocations(),
    })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (s) => {
    const existingMap = {}
    s.allocations.forEach(a => { existingMap[a.insurer_policy_period_id] = a })
    setFormData({
      settlement_date: s.settlement_date,
      total_amount:    String(s.total_amount),
      status:          s.status,
      notes:           s.notes || '',
      allocations:     buildInitAllocations(existingMap),
    })
    setEditingId(s.id)
    setShowForm(true)
  }

  const updateAlloc = (idx, field, value) =>
    setFormData(prev => {
      const allocations = [...prev.allocations]
      allocations[idx] = { ...allocations[idx], [field]: value }
      return { ...prev, allocations }
    })

  // ── Save mutation ────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ allocations, ...header }) => {
      const totalAmount = parseFloat(header.total_amount) ||
        allocations.reduce((s, a) => s + (parseFloat(a.settlement_amount) || 0), 0)

      let settlementId = editingId

      if (editingId) {
        const { error } = await supabase.from('la_settlements').update({
          settlement_date: header.settlement_date,
          total_amount:    totalAmount,
          status:          header.status,
          notes:           header.notes || null,
          updated_at:      new Date().toISOString(),
        }).eq('id', editingId)
        if (error) throw error
        // Replace allocations
        await supabase.from('la_settlement_allocations').delete().eq('settlement_id', editingId)
      } else {
        const { data, error } = await supabase.from('la_settlements').insert({
          matter_id:       matterId,
          org_id:          orgId,
          settlement_date: header.settlement_date,
          total_amount:    totalAmount,
          status:          header.status,
          notes:           header.notes || null,
        }).select('id').single()
        if (error) throw error
        settlementId = data.id
      }

      const rows = allocations
        .filter(a => parseFloat(a.settlement_amount) > 0 || parseFloat(a.reserve_amount) > 0)
        .map(a => ({
          settlement_id:            settlementId,
          insurer_id:               a.insurer_id  || null,
          insurer_policy_period_id: a.insurer_policy_period_id || null,
          party_id:                 a.party_id    || null,
          original_demand:          Number(a.original_demand)               || 0,
          reserve_amount:           parseFloat(a.reserve_amount)            || 0,
          settlement_amount:        parseFloat(a.settlement_amount)         || 0,
          notes:                    a.notes || null,
        }))
      if (rows.length) {
        const { error } = await supabase.from('la_settlement_allocations').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success('Settlement saved')
      qc.invalidateQueries(['settlement', matterId])
      setShowForm(false)
    },
    onError: (e) => toast.error('Save failed: ' + (e.message || 'Unknown error')),
  })

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="p-10 text-center text-slate-400">
      <div className="h-6 w-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
    </div>
  )

  // ── Form view ────────────────────────────────────────────────────────────────
  if (showForm && formData) {
    const allocTotal = formData.allocations.reduce((s, a) => s + (parseFloat(a.settlement_amount) || 0), 0)
    const totalDemanded = formData.allocations.reduce((s, a) => s + (a.original_demand || 0), 0)

    return (
      <div className="p-6 max-w-5xl">
        {/* Form header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? 'Edit Settlement' : 'Record Settlement'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Document the final allocation and reserve tracking per insurer
            </p>
          </div>
          <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Header fields */}
        <div className="card p-5 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Settlement Date
              </label>
              <input
                type="date"
                value={formData.settlement_date}
                onChange={e => setFormData(p => ({ ...p, settlement_date: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Total Settlement Amount
                {allocTotal > 0 && (
                  <span className="ml-2 font-normal text-slate-400 normal-case text-xs">
                    (alloc sum: {formatCurrency(allocTotal)})
                  </span>
                )}
              </label>
              <input
                type="number" step="0.01"
                value={formData.total_amount}
                placeholder={allocTotal > 0 ? allocTotal.toFixed(2) : '0.00'}
                onChange={e => setFormData(p => ({ ...p, total_amount: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-slate-400 mt-1">Leave blank to auto-sum allocations</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Status
              </label>
              <select
                value={formData.status}
                onChange={e => setFormData(p => ({ ...p, status: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="draft">Draft</option>
                <option value="final">Final</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              placeholder="Settlement context, conditions, confidentiality terms, etc."
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>

        {/* Allocation table */}
        <div className="card overflow-hidden mb-5">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Insurer Allocations</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Reserve = amount insurer set aside against policy limit. Settlement = actual amount paid.
              </p>
            </div>
            {totalDemanded > 0 && allocTotal > 0 && (
              <div className="text-right text-xs">
                <span className={`font-semibold ${totalDemanded - allocTotal >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totalDemanded - allocTotal >= 0
                    ? `↓ ${formatCurrency(totalDemanded - allocTotal)} under demand`
                    : `↑ ${formatCurrency(allocTotal - totalDemanded)} over demand`}
                </span>
              </div>
            )}
          </div>

          {formData.allocations.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              No insurer policy periods on this matter yet.{' '}
              <span className="text-xs">Add parties and insurers in the Parties tab first.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Insurer</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Policy Limit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Demanded</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Reserve Set</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Settlement Amt</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {formData.allocations.map((alloc, idx) => {
                    const settled  = parseFloat(alloc.settlement_amount) || 0
                    const demanded = alloc.original_demand || 0
                    const savings  = demanded > 0 && settled > 0 ? demanded - settled : null
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-800">{alloc.insurer_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{alloc.party_name}</td>
                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap text-xs">
                          {alloc.policy_limit > 0 ? formatCurrency(alloc.policy_limit) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap text-xs">
                          {demanded > 0 ? formatCurrency(demanded) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number" step="0.01"
                            value={alloc.reserve_amount}
                            placeholder="0.00"
                            onChange={e => updateAlloc(idx, 'reserve_amount', e.target.value)}
                            className="w-28 text-right text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <input
                              type="number" step="0.01"
                              value={alloc.settlement_amount}
                              placeholder="0.00"
                              onChange={e => updateAlloc(idx, 'settlement_amount', e.target.value)}
                              className="w-28 text-right text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            {savings !== null && (
                              <span className={`text-xs ${savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {savings >= 0
                                  ? `↓ ${formatCurrency(savings)} saved`
                                  : `↑ ${formatCurrency(-savings)} over`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={alloc.notes}
                            placeholder="Optional note"
                            onChange={e => updateAlloc(idx, 'notes', e.target.value)}
                            className="w-full min-w-[120px] text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                    <td colSpan={3} className="px-4 py-3 text-slate-700">Totals</td>
                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                      {formatCurrency(totalDemanded)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                      {formatCurrency(formData.allocations.reduce((s, a) => s + (parseFloat(a.reserve_amount) || 0), 0))}
                    </td>
                    <td className="px-4 py-3 text-right text-green-700 whitespace-nowrap">
                      {formatCurrency(allocTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button
            onClick={() => saveMutation.mutate(formData)}
            disabled={saveMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <Check className="h-4 w-4" />
            {saveMutation.isPending ? 'Saving…' : 'Save Settlement'}
          </button>
        </div>
      </div>
    )
  }

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!settlement) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Scale className="h-7 w-7 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-800 mb-1">No settlement recorded</h3>
        <p className="text-sm text-slate-500 mb-5 max-w-sm">
          When this matter settles, record the final allocation per insurer and
          compare it against original apportionment demands.
        </p>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Record Settlement
        </button>
      </div>
    )
  }

  // ── Summary view ─────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl space-y-6">

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-lg font-semibold text-slate-900">Settlement</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[settlement.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {settlement.status === 'final' ? 'Final' : 'Draft'}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Settled {format(parseISO(settlement.settlement_date), 'MMMM d, yyyy')}
            {settlement.notes && (
              <span className="ml-2 text-slate-400 italic">· {settlement.notes}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => openEdit(settlement)}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-800 font-medium transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* KPI cards */}
      {summaryStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Settlement"
            value={formatCurrency(settlement.total_amount)}
            color="text-slate-900"
          />
          <KpiCard
            label="Total Demanded"
            value={formatCurrency(summaryStats.totalDemanded)}
            color="text-slate-700"
          />
          <KpiCard
            label="Savings vs. Demand"
            value={
              (summaryStats.savings >= 0 ? '' : '−') +
              formatCurrency(Math.abs(summaryStats.savings))
            }
            sub={
              summaryStats.totalDemanded > 0
                ? `${pct(summaryStats.savings, summaryStats.totalDemanded)}% reduction`
                : undefined
            }
            color={summaryStats.savings >= 0 ? 'text-green-600' : 'text-red-600'}
          />
          <KpiCard
            label="Total Reserved"
            value={formatCurrency(summaryStats.totalReserve)}
            sub={
              summaryStats.totalReserve > 0 && settlement.total_amount > 0
                ? `${pct(settlement.total_amount, summaryStats.totalReserve)}% of reserve paid`
                : undefined
            }
            color="text-amber-600"
          />
        </div>
      )}

      {/* Allocation detail table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Insurer Allocation Detail</h3>
        </div>
        {settlement.allocations?.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No insurer allocations recorded.{' '}
            <button onClick={() => openEdit(settlement)} className="text-brand-600 hover:underline">Edit to add them.</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Insurer</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Policy Limit</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Demanded</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Reserve</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Settlement</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Savings</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlement.allocations.map((alloc, i) => {
                  const savings  = Number(alloc.original_demand || 0) - Number(alloc.settlement_amount || 0)
                  const limit    = alloc.policy_period?.policy_limit || 0
                  const exhaust  = limit > 0 ? pct(alloc.settlement_amount, limit) : null
                  return (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{alloc.insurer?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{alloc.party?.name || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap text-xs">
                        {limit > 0 ? formatCurrency(limit) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600 whitespace-nowrap">
                        {Number(alloc.original_demand) > 0
                          ? formatCurrency(alloc.original_demand)
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">
                        {Number(alloc.reserve_amount) > 0
                          ? formatCurrency(alloc.reserve_amount)
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                        {formatCurrency(alloc.settlement_amount || 0)}
                        {exhaust !== null && (
                          <span className="block text-xs font-normal text-slate-400">{exhaust}% of limit</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {Number(alloc.original_demand) > 0
                          ? <>{savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(savings))}</>
                          : <span className="text-slate-300 font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{alloc.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {summaryStats && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                    <td colSpan={3} className="px-4 py-3 text-slate-700">Totals</td>
                    <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">
                      {formatCurrency(summaryStats.totalDemanded)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-600 whitespace-nowrap">
                      {formatCurrency(summaryStats.totalReserve)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-800 whitespace-nowrap">
                      {formatCurrency(settlement.total_amount)}
                    </td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${summaryStats.savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {summaryStats.savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(summaryStats.savings))}
                      {summaryStats.totalDemanded > 0 && (
                        <span className="block text-xs font-normal text-slate-400">
                          {pct(summaryStats.savings, summaryStats.totalDemanded)}% reduction
                        </span>
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
