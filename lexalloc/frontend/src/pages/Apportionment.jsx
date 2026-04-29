import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { formatCurrency, formatPercent, exhaustionInfo } from '../lib/calculations.js'
import { generateDemandLetterBlob, getDemandLetterFilename, buildDemandLetterEmailHtml } from '../lib/generateDemandLetter.js'
import { generateApportionmentReport } from '../lib/generateApportionmentReport.js'
import DemandLetterModal from '../components/DemandLetterModal.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { ArrowLeft, Printer, Download, ChevronDown, ChevronRight, Shield, Users, Calendar, DollarSign, X, CheckCircle2, AlertTriangle, Mail, FileDown, Bell, Clock, BookOpen, PlugZap, Lock, Unlock, Pencil } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns'
import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
// recharts removed — replaced by custom SankeyDiagram
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'
import { logAudit } from '../lib/audit.js'

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
function RecordPaymentModal({ ia, partyName, matterId, onClose, onSaved }) {
  const { profile } = useAuth()
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
    logAudit({ profile, matterId, action: 'payment.updated', entityType: 'payment', entityId: ia.id, entityName: ia.insurers?.name, metadata: { old_status: ia.payment_status, new_status: values.payment_status, amount_paid: parseFloat(values.amount_paid) || 0, party: partyName } })
    toast.success('Payment status updated')
    onSaved(values.payment_status)
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

function BulkPaymentModal({ partyApportionments, matterId, apportionmentId, onClose, onSaved }) {
  const { profile } = useAuth()
  const today = new Date().toISOString().split('T')[0]

  // Flatten all outstanding IAs across all parties
  const allRows = (partyApportionments || []).flatMap(pa =>
    (pa.insurer_apportionments || [])
      .filter(ia => !['paid', 'written_off'].includes(ia.payment_status))
      .map(ia => ({ ia, partyName: pa.parties?.name || '—' }))
  )

  const [selected,    setSelected]    = useState(() => new Set(allRows.map(r => r.ia.id)))
  const [status,      setStatus]      = useState('paid')
  const [payDate,     setPayDate]     = useState(today)
  const [amounts,     setAmounts]     = useState(() => {
    const m = {}
    allRows.forEach(({ ia }) => { m[ia.id] = ia.amount != null ? String(ia.amount) : '' })
    return m
  })
  const [saving, setSaving] = useState(false)

  const toggleAll = () =>
    setSelected(s => s.size === allRows.length ? new Set() : new Set(allRows.map(r => r.ia.id)))

  const toggle = (id) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleApply = async () => {
    const targets = allRows.filter(r => selected.has(r.ia.id))
    if (!targets.length) { toast.error('No rows selected'); return }
    setSaving(true)
    try {
      await Promise.all(targets.map(({ ia }) =>
        supabase.from('la_insurer_apportionments').update({
          payment_status: status,
          amount_paid:    status === 'paid' || status === 'partially_paid'
            ? parseFloat(amounts[ia.id]) || 0 : 0,
          payment_date:   status === 'paid' || status === 'partially_paid'
            ? payDate || null : null,
        }).eq('id', ia.id)
      ))
      await Promise.all(targets.map(({ ia, partyName }) =>
        logAudit({ profile, matterId, action: 'payment.updated', entityType: 'payment',
          entityId: ia.id, entityName: ia.insurers?.name,
          metadata: { bulk: true, new_status: status, amount_paid: parseFloat(amounts[ia.id]) || 0, party: partyName } })
      ))
      toast.success(`${targets.length} payment${targets.length !== 1 ? 's' : ''} updated`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Bulk update failed')
    } finally {
      setSaving(false)
    }
  }

  const showAmounts = status === 'paid' || status === 'partially_paid'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg">Bulk Record Payments</h2>
            <p className="text-sm text-slate-500 mt-0.5">{allRows.length} outstanding obligation{allRows.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-end gap-4 flex-shrink-0">
          <div>
            <label className="form-label mb-1">Apply Status</label>
            <select className="form-input py-1.5" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="paid">Paid in Full</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="disputed">Disputed</option>
              <option value="demanded">Demanded</option>
            </select>
          </div>
          {showAmounts && (
            <div>
              <label className="form-label mb-1">Payment Date</label>
              <input type="date" className="form-input py-1.5" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">{selected.size} of {allRows.length} selected</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {allRows.length === 0 ? (
            <p className="text-center text-slate-400 py-12">No outstanding obligations on this apportionment.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left w-10">
                    <input type="checkbox" checked={selected.size === allRows.length} onChange={toggleAll}
                      className="rounded border-slate-300" />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Insurer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Owed</th>
                  {showAmounts && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount Paid ($)</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allRows.map(({ ia, partyName }) => (
                  <tr key={ia.id} className={`hover:bg-slate-50 ${selected.has(ia.id) ? 'bg-brand-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(ia.id)} onChange={() => toggle(ia.id)}
                        className="rounded border-slate-300" />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{ia.insurers?.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{partyName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(ia.amount)}</td>
                    {showAmounts && (
                      <td className="px-4 py-3">
                        <input
                          type="number" step="0.01" min="0"
                          value={amounts[ia.id]}
                          onChange={e => setAmounts(a => ({ ...a, [ia.id]: e.target.value }))}
                          disabled={!selected.has(ia.id)}
                          className="form-input py-1 text-right w-32 ml-auto block disabled:opacity-40"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${
                        ia.payment_status === 'demanded' ? 'bg-amber-100 text-amber-700' :
                        ia.payment_status === 'partially_paid' ? 'bg-blue-100 text-blue-700' :
                        ia.payment_status === 'disputed' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{ia.payment_status?.replace('_', ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleApply}
            disabled={saving || selected.size === 0}
            className="btn-primary"
          >
            <CheckCircle2 className="h-4 w-4" />
            {saving ? 'Saving…' : `Apply to ${selected.size} Insurer${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
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

// ── Override Modal ────────────────────────────────────────────────────────────
function OverrideModal({ ia, partyName, invoiceTotal, matterId, onClose, onSaved }) {
  const { profile } = useAuth()
  const [pct,    setPct]    = useState(ia.override_pct != null ? String(ia.override_pct) : '')
  const [reason, setReason] = useState(ia.override_reason || '')
  const [saving, setSaving] = useState(false)

  const pctNum        = parseFloat(pct)
  const validPct      = !isNaN(pctNum) && pctNum >= 0 && pctNum <= 100
  const effectiveAmt  = validPct ? (pctNum / 100) * invoiceTotal : null
  const hasOverride   = ia.override_pct != null

  const save = async () => {
    if (!validPct) { toast.error('Enter a percentage between 0 and 100'); return }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('la_insurer_apportionments')
        .update({
          override_pct:    pctNum,
          override_reason: reason.trim() || null,
          override_set_by: profile?.email,
          override_set_at: new Date().toISOString(),
        })
        .eq('id', ia.id)
      if (error) throw error
      logAudit({
        profile, matterId,
        action: 'insurer.override_set',
        entityType: 'insurer_apportionment',
        entityId: ia.id,
        entityName: ia.insurers?.name,
        metadata: {
          calculated_pct: ia.percentage,
          override_pct:   pctNum,
          reason:         reason.trim() || null,
          party:          partyName,
        },
      })
      toast.success('Override saved')
      onSaved()
      onClose()
    } catch {
      toast.error('Failed to save override')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('la_insurer_apportionments')
        .update({ override_pct: null, override_reason: null, override_set_by: null, override_set_at: null })
        .eq('id', ia.id)
      if (error) throw error
      logAudit({
        profile, matterId,
        action: 'insurer.override_cleared',
        entityType: 'insurer_apportionment',
        entityId: ia.id,
        entityName: ia.insurers?.name,
        metadata: { cleared_override_pct: ia.override_pct, party: partyName },
      })
      toast.success('Override cleared — reverting to calculated percentage')
      onSaved()
      onClose()
    } catch {
      toast.error('Failed to clear override')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-500" />
              Custom Percentage Override
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">{ia.insurers?.name} · {partyName}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Calculated vs agreed comparison */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Calculated</p>
              <p className="text-xl font-bold text-slate-700">{ia.percentage?.toFixed(2)}%</p>
              <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(ia.amount)}</p>
            </div>
            <div className={`rounded-xl p-3 text-center border-2 ${validPct ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-xs text-slate-500 mb-1">Agreed / Override</p>
              <p className={`text-xl font-bold ${validPct ? 'text-amber-700' : 'text-slate-300'}`}>
                {validPct ? `${pctNum.toFixed(2)}%` : '—'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {effectiveAmt != null ? formatCurrency(effectiveAmt) : '—'}
              </p>
            </div>
          </div>

          <div>
            <label className="form-label">Agreed Percentage *</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={pct}
                onChange={e => setPct(e.target.value)}
                placeholder="e.g. 22.00"
                className="form-input pr-8"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">%</span>
            </div>
          </div>

          <div>
            <label className="form-label">Reason / Audit Note</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Agreed with carrier at policy inception per coverage counsel memo dated 3/15/25"
              rows={3}
              className="form-input resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">Stored alongside the calculated value for the audit trail.</p>
          </div>

          {hasOverride && ia.override_set_by && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <p className="font-medium">Override currently active</p>
              <p className="mt-0.5">Set by {ia.override_set_by}{ia.override_set_at ? ` on ${format(new Date(ia.override_set_at), 'MMM d, yyyy')}` : ''}</p>
              {ia.override_reason && <p className="mt-1 italic">"{ia.override_reason}"</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-slate-200 gap-3">
          {hasOverride ? (
            <button
              onClick={clear}
              disabled={saving}
              className="btn-secondary text-sm flex items-center gap-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              <Unlock className="h-4 w-4" />
              Clear Override
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !validPct}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saving ? <><Clock className="h-4 w-4 animate-spin" /> Saving…</> : <><Lock className="h-4 w-4" /> Apply Override</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sankey Flow Diagram ───────────────────────────────────────────────────────
function SankeyDiagram({ partyApps, totalAmount }) {
  const W = 720, H = 390, nodeW = 18, vGap = 10, padY = 44, padBottom = 20
  const usableH = H - padY - padBottom

  // Build a stable carrier → color map (first-seen order)
  const carrierColors = useMemo(() => {
    const map = {}
    let ci = 0
    partyApps.forEach(pa =>
      (pa.insurer_apportionments || []).forEach(ia => {
        const n = ia.insurers?.name
        if (n && !map[n]) map[n] = COLORS[ci++ % COLORS.length]
      })
    )
    return map
  }, [partyApps])

  const total = totalAmount || 1
  const c0x = 20, c1x = 240, c2x = 480

  // Invoice node — full usable height
  const inv = { x: c0x, y: padY, h: usableH }

  // Party nodes — heights proportional to amount, with gaps between
  const partyGaps = Math.max(0, partyApps.length - 1) * vGap
  const partyScale = (usableH - partyGaps) / total
  const partyNodes = []
  let pCur = padY
  partyApps.forEach((pa, i) => {
    const h = Math.max(6, pa.amount * partyScale)
    partyNodes.push({ x: c1x, y: pCur, h, color: COLORS[i % COLORS.length], pa })
    pCur += h + vGap
  })

  // Insurer nodes — flat list, heights proportional to amount
  const flatIns = partyApps.flatMap((pa, pi) =>
    (pa.insurer_apportionments || []).map(ia => ({ ia, pi, pa }))
  )
  const insGaps = Math.max(0, flatIns.length - 1) * vGap
  const insScale = flatIns.length ? (usableH - insGaps) / total : 1
  const insNodes = []
  let iCur = padY
  flatIns.forEach(({ ia, pi }) => {
    const h = Math.max(6, ia.amount * insScale)
    insNodes.push({
      x: c2x, y: iCur, h,
      color: carrierColors[ia.insurers?.name] || COLORS[pi % COLORS.length],
      ia, pi,
    })
    iCur += h + vGap
  })

  // Links: Invoice → Party (source height tracks invoice node; target = party node)
  const ipLinks = []
  let invCur = padY
  partyNodes.forEach((pn) => {
    const sh = inv.h * (pn.pa.amount / total)
    ipLinks.push({ sx: c0x + nodeW, sy: invCur, sh, tx: c1x, ty: pn.y, th: pn.h, color: pn.color })
    invCur += sh
  })

  // Links: Party → Insurer (source height tracks party node; target = insurer node)
  const piLinks = []
  let insIdx = 0
  partyNodes.forEach((pn) => {
    let pOut = pn.y
    ;(pn.pa.insurer_apportionments || []).forEach(ia => {
      const iNode = insNodes[insIdx]
      if (!iNode) return
      const sh = pn.h * (ia.amount / (pn.pa.amount || 1))
      piLinks.push({ sx: c1x + nodeW, sy: pOut, sh, tx: c2x, ty: iNode.y, th: iNode.h, color: iNode.color })
      pOut += sh
      insIdx++
    })
  })

  // Bezier band path between two rectangular endpoints
  const band = ({ sx, sy, sh, tx, ty, th }) => {
    const mx = (sx + tx) / 2
    return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty} L${tx},${ty + th} C${mx},${ty + th} ${mx},${sy + sh} ${sx},${sy + sh} Z`
  }

  const trunc = (s, n = 24) => !s ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Column headers */}
      <text x={c0x + nodeW / 2} y={padY - 16} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight="600" letterSpacing="0.06em">INVOICE</text>
      <text x={c1x + nodeW / 2} y={padY - 16} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight="600" letterSpacing="0.06em">PARTIES</text>
      <text x={c2x + nodeW / 2} y={padY - 16} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight="600" letterSpacing="0.06em">CARRIERS</text>

      {/* Flow bands (drawn behind nodes) */}
      {ipLinks.map((l, i) => <path key={`ip${i}`} d={band(l)} fill={l.color} opacity={0.22} />)}
      {piLinks.map((l, i) => <path key={`pi${i}`} d={band(l)} fill={l.color} opacity={0.22} />)}

      {/* Invoice node */}
      <rect x={inv.x} y={inv.y} width={nodeW} height={inv.h} rx={4} fill="#6366f1" />
      <text x={inv.x + nodeW + 9} y={inv.y + inv.h / 2 - 8} fontSize={11} fill="#1e293b" fontWeight="700" dominantBaseline="middle">Invoice Total</text>
      <text x={inv.x + nodeW + 9} y={inv.y + inv.h / 2 + 8} fontSize={10} fill="#64748b" dominantBaseline="middle">{formatCurrency(total)}</text>

      {/* Party nodes */}
      {partyNodes.map((n, i) => (
        <g key={i}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} fill={n.color} />
          {n.h >= 24 ? (
            <>
              <text x={n.x + nodeW + 9} y={n.y + n.h / 2 - 7} fontSize={10} fill="#1e293b" fontWeight="600" dominantBaseline="middle">{trunc(n.pa.parties?.name)}</text>
              <text x={n.x + nodeW + 9} y={n.y + n.h / 2 + 7} fontSize={9} fill="#64748b" dominantBaseline="middle">{formatCurrency(n.pa.amount)} · {(n.pa.percentage || 0).toFixed(1)}%</text>
            </>
          ) : (
            <text x={n.x + nodeW + 9} y={n.y + n.h / 2} fontSize={10} fill="#1e293b" fontWeight="600" dominantBaseline="middle">{trunc(n.pa.parties?.name)}</text>
          )}
        </g>
      ))}

      {/* Insurer nodes */}
      {insNodes.map((n, i) => (
        <g key={i}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} fill={n.color} />
          {n.h >= 24 ? (
            <>
              <text x={n.x + nodeW + 9} y={n.y + n.h / 2 - 7} fontSize={10} fill="#1e293b" fontWeight="600" dominantBaseline="middle">{trunc(n.ia.insurers?.name)}</text>
              <text x={n.x + nodeW + 9} y={n.y + n.h / 2 + 7} fontSize={9} fill="#64748b" dominantBaseline="middle">{formatCurrency(n.ia.amount)}</text>
            </>
          ) : (
            <text x={n.x + nodeW + 9} y={n.y + n.h / 2} fontSize={10} fill="#1e293b" fontWeight="600" dominantBaseline="middle">{trunc(n.ia.insurers?.name)}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function Apportionment() {
  const { matterId, apportionmentId } = useParams()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const [paymentModal,   setPaymentModal]   = useState(null)   // { ia, partyName }
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false)
  const [letterModal,    setLetterModal]    = useState(null)   // { apport, invoice, pa, ia, orgName }
  const [overrideModal,  setOverrideModal]  = useState(null)   // { ia, partyName }
  const [generatingAll, setGeneratingAll] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(new Set()) // set of ia.ids

  const { data: apport, isLoading } = useQuery({
    queryKey: ['apportionment', apportionmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select(`
          *,
          invoices:la_invoices(invoice_number, total_amount, invoice_date, billing_firm, service_start, service_end),
          matters:la_matters(name, matter_number),
          party_apportionments:la_party_apportionments(
            id, percentage, amount,
            parties:la_parties(name),
            insurer_apportionments:la_insurer_apportionments(
              id, insurer_id, days_on_risk, total_days, percentage, amount,
              payment_status, amount_paid, payment_date, demanded_at, payment_notes,
              insurer_policy_period_id, lexalloc_invoice_number,
              override_pct, override_reason, override_set_by, override_set_at,
              insurers:la_insurers(name, policy_number),
              insurer_policy_periods:la_insurer_policy_periods(policy_start, policy_end, policy_limit, deductible, claim_number, claims_rep_name, claims_rep_email, billing_address)
            )
          )
        `)
        .eq('id', apportionmentId)
        .single()
      return data
    }
  })

  // All insurer apportionment ids in this apportionment (for reminder query)
  const iaIds = useMemo(() => {
    if (!apport) return []
    return (apport.party_apportionments || []).flatMap(pa =>
      (pa.insurer_apportionments || []).map(ia => ia.id)
    )
  }, [apport])

  const { data: remindersMap = {} } = useQuery({
    queryKey: ['payment-reminders', apportionmentId],
    queryFn: async () => {
      if (!iaIds.length) return {}
      const { data } = await supabase
        .from('la_payment_reminders')
        .select('insurer_apportionment_id, days_threshold, triggered_by, sent_at, status, schedule_type')
        .in('insurer_apportionment_id', iaIds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
      // Build map: iaId → sorted list of reminders (most recent first)
      const map = {}
      for (const r of data ?? []) {
        if (!map[r.insurer_apportionment_id]) map[r.insurer_apportionment_id] = []
        map[r.insurer_apportionment_id].push(r)
      }
      return map
    },
    enabled: iaIds.length > 0,
  })

  const sendReminder = async (ia) => {
    const iaId = ia.id
    setSendingReminder(prev => new Set([...prev, iaId]))
    try {
      const { error } = await supabase.functions.invoke('send-payment-reminders', {
        body: { insurer_apportionment_id: iaId },
      })
      if (error) throw new Error(error.message)
      toast.success(`Reminder sent to ${ia.insurer_policy_periods?.claims_rep_email || ia.insurers?.name || 'insurer'}`)
      qc.invalidateQueries({ queryKey: ['payment-reminders', apportionmentId] })
    } catch (err) {
      toast.error('Reminder failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSendingReminder(prev => { const n = new Set(prev); n.delete(iaId); return n })
    }
  }

  const daysOutstanding = (demandedAt) => {
    if (!demandedAt) return null
    return differenceInCalendarDays(new Date(), new Date(demandedAt))
  }

  // Compute the next auto-reminder date based on the collection schedule logic
  const nextFollowUp = (ia, iaReminders, days) => {
    if (!['demanded', 'partially_paid', 'disputed'].includes(ia.payment_status)) return null
    if (days === null) return null
    const lastSent = iaReminders[0]?.sent_at ? new Date(iaReminders[0].sent_at) : null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    if (days >= 90) {
      // Weekly cadence
      if (!lastSent) return today
      const next = addDays(lastSent, 7)
      return next <= today ? today : next
    } else if (days >= 60) {
      // Biweekly cadence
      if (!lastSent) return today
      const next = addDays(lastSent, 14)
      return next <= today ? today : next
    } else {
      // Monthly cadence — 1st of next month
      const now = new Date()
      return new Date(now.getFullYear(), now.getMonth() + 1, 1)
    }
  }

  // ── Accounting push ─────────────────────────────────────────────────────────
  const [pushingBooks, setPushingBooks] = useState(new Set()) // ia.ids currently pushing

  // Fetch accounting connections for this org (to know which providers are available)
  const { data: accountingConns = [] } = useQuery({
    queryKey: ['accounting-connections-appt'],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_accounting_connections')
        .select('provider, is_active')
        .eq('is_active', true)
      return data || []
    },
  })

  const { data: pushesMap = {} } = useQuery({
    queryKey: ['accounting-pushes', apportionmentId],
    queryFn: async () => {
      if (!iaIds.length) return {}
      const { data } = await supabase
        .from('la_accounting_pushes')
        .select('insurer_apportionment_id, provider, status, external_id, pushed_at')
        .in('insurer_apportionment_id', iaIds)
        .order('pushed_at', { ascending: false })
      const map = {}
      for (const p of data ?? []) {
        if (!map[p.insurer_apportionment_id]) map[p.insurer_apportionment_id] = []
        map[p.insurer_apportionment_id].push(p)
      }
      return map
    },
    enabled: iaIds.length > 0,
  })

  const availableProviders = accountingConns.map(c => c.provider)

  // Cumulative obligated per policy_period_id across ALL invoices on this matter
  // (not just this apportionment — so the limit column shows total exposure)
  const { data: cumulativeByPeriod = {} } = useQuery({
    queryKey: ['matter-cumulative-limits', matterId],
    queryFn: async () => {
      // Fetch all apportionment IDs for this matter first
      const { data: appts } = await supabase
        .from('la_apportionments')
        .select('id')
        .eq('matter_id', matterId)
      const apptIds = (appts ?? []).map(a => a.id)
      if (!apptIds.length) return {}

      const { data: iaRows } = await supabase
        .from('la_insurer_apportionments')
        .select('insurer_policy_period_id, amount')
        .in('apportionment_id', apptIds)

      const map = {}
      for (const r of iaRows ?? []) {
        if (r.insurer_policy_period_id) {
          map[r.insurer_policy_period_id] = (map[r.insurer_policy_period_id] || 0) + (Number(r.amount) || 0)
        }
      }
      return map
    },
    enabled: !!matterId,
  })

  // Policy limit alerts for this matter
  const { data: limitAlerts = [] } = useQuery({
    queryKey: ['policy-limit-alerts', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_policy_limit_alerts')
        .select('policy_period_id, threshold, alerted_at')
        .eq('matter_id', matterId)
      return data || []
    },
    enabled: !!matterId,
  })

  const alertedThresholds = useMemo(() => {
    const map = {}
    for (const a of limitAlerts) {
      if (!map[a.policy_period_id]) map[a.policy_period_id] = new Set()
      map[a.policy_period_id].add(a.threshold)
    }
    return map
  }, [limitAlerts])

  const pushToBooks = async (ia, provider) => {
    const iaId = `${ia.id}:${provider}`
    setPushingBooks(prev => new Set([...prev, iaId]))
    try {
      const { error } = await supabase.functions.invoke('push-accounting-payment', {
        body: { insurer_apportionment_id: ia.id, provider },
      })
      if (error) throw new Error(error.message)
      const providerLabel = provider === 'quickbooks' ? 'QuickBooks' : 'Clio'
      toast.success(`Pushed to ${providerLabel}`)
      qc.invalidateQueries({ queryKey: ['accounting-pushes', apportionmentId] })
    } catch (err) {
      toast.error('Push failed: ' + (err.message || 'Unknown error'))
    } finally {
      setPushingBooks(prev => { const n = new Set(prev); n.delete(iaId); return n })
    }
  }

  const handlePrint = () => window.print()

  const handleDownloadPDF = async () => {
    try {
      await generateApportionmentReport(apport)
    } catch (err) {
      toast.error('PDF generation failed: ' + err.message)
    }
  }

  const openLetterModal = (pa, ia) => {
    setLetterModal({
      apport,
      invoice: apport.invoices || {},
      pa,
      ia,
      orgName: profile?.la_organizations?.name || '',
    })
    logAudit({ profile, matterId, action: 'demand_letter.generated', entityType: 'demand_letter', entityId: ia.id, entityName: ia.insurers?.name, metadata: { invoice_number: apport.invoices?.invoice_number, party: pa.parties?.name, amount: ia.amount } })
  }

  // ── LexAlloc invoice number generator ────────────────────────────────────────
  // Format: [INSURER4].[FIRM4].[MATTER].[YYYYMM].[SEQ]
  // e.g.  : AJAX.HARR.BL0047.202404.001
  const getOrCreateLexAllocNumber = async (ia, inv, matter) => {
    if (ia.lexalloc_invoice_number) return ia.lexalloc_invoice_number

    const abbr = (str, len) =>
      (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len).padEnd(len, 'X')

    const insurerAbbr = abbr(ia.insurers?.name,  4)
    const firmAbbr    = abbr(inv.billing_firm,    4)
    const matterCode  = (matter?.matter_number || '')
      .replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'MTR'
    const invoiceDate = inv.invoice_date ? new Date(inv.invoice_date) : new Date()
    const dateCode    = `${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
    const prefix      = `${insurerAbbr}.${firmAbbr}.${matterCode}`

    // Count existing demand numbers for this insurer × matter combo to get next sequence
    const { count } = await supabase
      .from('la_insurer_apportionments')
      .select('id', { count: 'exact', head: true })
      .not('lexalloc_invoice_number', 'is', null)
      .like('lexalloc_invoice_number', `${prefix}.%`)

    const seq    = String((count || 0) + 1).padStart(3, '0')
    const number = `${prefix}.${dateCode}.${seq}`

    await supabase
      .from('la_insurer_apportionments')
      .update({ lexalloc_invoice_number: number })
      .eq('id', ia.id)

    return number
  }

  const handleGenerateAll = async () => {
    const allPairs = (apport.party_apportionments || []).flatMap(pa =>
      (pa.insurer_apportionments || [])
        .filter(ia => ia.amount > 0)
        .map(ia => ({ pa, ia }))
    )
    if (allPairs.length === 0) { toast.error('No insurer obligations to generate letters for.'); return }
    setGeneratingAll(true)

    let emailsSent    = 0
    let emailsSkipped = 0  // no email on file at all
    let emailErrors   = [] // email found but function failed

    try {
      const inv     = apport.invoices || {}
      const orgName = profile?.la_organizations?.name || ''
      const matter  = apport.matters || {}

      // ── Step 1: bulk-fetch policy periods for this matter, keyed by insurer_id ──
      // insurer_policy_period_id FK is NULL on many rows, so we match by insurer_id + matter_id.
      // Fall back to querying by insurer_id alone if the matter-scoped query returns nothing.
      const { data: ippRows, error: ippError } = await supabase
        .from('la_insurer_policy_periods')
        .select('id, insurer_id, claims_rep_name, claims_rep_email, billing_address, claim_number')
        .eq('matter_id', apport.matter_id)

      if (ippError) { /* ipp query failed — fall through, claimsEmail will be null */ }

      const ippByInsurer = {}
      for (const row of (ippRows || [])) {
        // Keep first match per insurer (there should only be one per matter)
        if (!ippByInsurer[row.insurer_id]) ippByInsurer[row.insurer_id] = row
      }

      // ── Step 2: if bulk query missed any insurer, fetch individually as fallback ──
      const allInsurerIds = allPairs.map(({ ia }) => ia.insurer_id).filter(Boolean)
      const missing = allInsurerIds.filter(id => id && !ippByInsurer[id])
      if (missing.length > 0) {
        const { data: fallbackRows } = await supabase
          .from('la_insurer_policy_periods')
          .select('id, insurer_id, claims_rep_name, claims_rep_email, billing_address, claim_number')
          .in('insurer_id', missing)
        for (const row of (fallbackRows || [])) {
          if (!ippByInsurer[row.insurer_id]) ippByInsurer[row.insurer_id] = row
        }
      }

      for (let i = 0; i < allPairs.length; i++) {
        const { pa, ia } = allPairs[i]
        // Stagger downloads so browsers don't block them
        if (i > 0) await new Promise(r => setTimeout(r, 600))

        // 0. Get or create the LexAlloc invoice number for this IA
        const lexallocInvoiceNumber = await getOrCreateLexAllocNumber(ia, inv, matter)

        // 1. Generate blob + download to admin's machine
        const blob     = await generateDemandLetterBlob({ apport, invoice: inv, pa, ia, orgName, lexallocInvoiceNumber })
        const filename = getDemandLetterFilename({ apport, invoice: inv, ia })
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        // 2. Convert blob to base64 for email attachment
        const arrayBuffer = await blob.arrayBuffer()
        const uint8       = new Uint8Array(arrayBuffer)
        let binary = ''
        uint8.forEach(b => { binary += String.fromCharCode(b) })
        const base64 = btoa(binary)

        // 3. Resolve contact info — try bulk result, then inline FK join, then insurer contact
        const ipp         = ippByInsurer[ia.insurer_id] || ia.insurer_policy_periods || {}
        const claimsEmail = ipp.claims_rep_email || ia.insurers?.contact_email || null

        // 4. Send email with attachment + mark as demanded
        try {
          const emailHtml = buildDemandLetterEmailHtml({ apport, invoice: inv, pa, ia, orgName, lexallocInvoiceNumber })
          const { data: fnData, error: fnErr } = await supabase.functions.invoke('send-demand-letter', {
            body: {
              insurer_apportionment_id: ia.id,
              attachment_base64:        base64,
              attachment_filename:      filename,
              claims_rep_email:         claimsEmail,
              claims_rep_name:          ipp.claims_rep_name || null,
              insurer_name:             ia.insurers?.name   || null,
              lexalloc_invoice_number:  lexallocInvoiceNumber,
              email_html:               emailHtml,
            },
          })
          if (fnErr) throw new Error(fnErr.message || JSON.stringify(fnErr))
          if (claimsEmail) emailsSent++
          else emailsSkipped++
        } catch (err) {
          if (claimsEmail) {
            emailErrors.push({ name: ia.insurers?.name, msg: err.message })
          } else {
            emailsSkipped++
          }
        }
      }

      // Refresh so demanded statuses show without a reload
      qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })

      const letterWord = allPairs.length !== 1 ? 'letters' : 'letter'
      if (emailsSent > 0) {
        const skippedNote = emailsSkipped > 0 ? ` · ${emailsSkipped} skipped (no email on file)` : ''
        const errorNote   = emailErrors.length > 0 ? ` · ${emailErrors.length} failed` : ''
        toast.success(`${allPairs.length} ${letterWord} downloaded · ${emailsSent} emailed${skippedNote}${errorNote}`, { duration: 6000 })
      } else if (emailErrors.length > 0) {
        toast.error(
          `${allPairs.length} ${letterWord} downloaded — email failed: ${emailErrors[0].msg}`,
          { duration: 10000 }
        )
      } else {
        toast.success(
          `${allPairs.length} ${letterWord} downloaded (no claims rep emails found — check insurer policy periods)`,
          { duration: 6000 }
        )
      }

    } catch (err) {
      toast.error('Error generating letters: ' + err.message)
    } finally {
      setGeneratingAll(false)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading apportionment…</div>
  if (!apport)   return <div className="p-8 text-center text-slate-400">Apportionment not found.</div>

  const result   = apport.result_json || {}
  const invoice  = apport.invoices || {}
  const partyApps = apport.party_apportionments || []

  // Method-aware display helpers
  const calcMethod = apport.calculation_method || 'pro_rata_time_on_risk'
  const isTOR      = calcMethod === 'pro_rata_time_on_risk'
  const isEqual    = calcMethod === 'equal_shares'
  const isLimits   = calcMethod === 'limits_proportional'
  const allocationLabel = isTOR ? 'TOR %' : isEqual ? 'Equal Split' : 'Limit Share %'
  const sectionSuffix   = isTOR ? 'Time-on-Risk Breakdown' : isEqual ? 'Split Evenly — All Carriers Breakdown' : 'Limits-Proportional Breakdown'

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
          <div className="flex gap-3 print:hidden flex-wrap">
            <button
              onClick={() => setBulkPaymentOpen(true)}
              className="btn-secondary"
            >
              <CheckCircle2 className="h-4 w-4" /> Bulk Mark Paid
            </button>
            <button
              onClick={handleGenerateAll}
              disabled={generatingAll}
              className="btn-secondary"
            >
              {generatingAll
                ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-brand-600 border-t-transparent rounded-full" /> Generating…</>
                : <><FileDown className="h-4 w-4" /> Generate All Letters</>}
            </button>
            <button onClick={handlePrint} className="btn-secondary"><Printer className="h-4 w-4" /> Print</button>
            <button onClick={handleDownloadPDF} className="btn-primary"><Download className="h-4 w-4" /> Export Report (PDF)</button>
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

      {/* Sankey Flow Diagram */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-slate-900">Allocation Flow</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">Invoice total → parties → carriers</p>
        <SankeyDiagram partyApps={partyApps} totalAmount={invoice.total_amount} />
      </div>

      <div className="space-y-6">
        {/* Party-level breakdown */}
        <SectionCard title="Party Apportionment Summary" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Party</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Share %</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Amount</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Insurers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.map((pa) => (
                  <tr key={pa.id}>
                    <td className="py-3 font-semibold text-slate-800">{pa.parties?.name}</td>
                    <td className="py-3 text-right whitespace-nowrap font-bold text-brand-700">{formatPercent(pa.percentage)}</td>
                    <td className="py-3 text-right whitespace-nowrap font-bold text-slate-900">{formatCurrency(pa.amount)}</td>
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
            title={`${pa.parties?.name} — Insurer ${sectionSuffix}`}
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
              {isTOR && (
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Exposure Days</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">
                    {pa.insurer_apportionments?.[0]?.total_days || '—'}
                  </p>
                </div>
              )}
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
                      {isTOR && <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>}
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">{allocationLabel}</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Obligation</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Policy Limit</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Paid</th>
                      <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pa.insurer_apportionments.map((ia) => {
                      const pp           = ia.insurer_policy_periods
                      const outstanding  = ia.amount - (ia.amount_paid || 0)
                      const days         = daysOutstanding(ia.demanded_at)
                      const iaReminders  = remindersMap[ia.id] || []
                      const lastReminder = iaReminders[0] ?? null
                      const canRemind    = ['demanded', 'pending', 'partially_paid', 'disputed'].includes(ia.payment_status)
                      const isSending    = sendingReminder.has(ia.id)
                      const tierColor    = days === null ? '' : days >= 90 ? 'text-red-600 bg-red-50' : days >= 60 ? 'text-orange-600 bg-orange-50' : days >= 30 ? 'text-amber-600 bg-amber-50' : 'text-slate-500 bg-slate-100'
                      const isPaid       = ia.payment_status === 'paid' || ia.payment_status === 'partially_paid'
                      const iaPushes     = pushesMap[ia.id] || []
                      const lastPush     = iaPushes[0] ?? null
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
                          {isTOR && (
                            <td className="py-3 text-right text-slate-600">{ia.days_on_risk} / {ia.total_days}</td>
                          )}
                          <td className="py-3 text-right">
                            {ia.override_pct != null ? (
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5">
                                  <Lock className="h-3 w-3 text-amber-500 print:hidden" />
                                  <span className="font-bold text-amber-700">{formatPercent(ia.override_pct)}</span>
                                </div>
                                <span className="text-xs text-slate-400 line-through">{formatPercent(ia.percentage)}</span>
                                <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded print:hidden">agreed</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-14 bg-slate-100 rounded-full h-1.5 print:hidden">
                                  <div className="bg-brand-600 h-1.5 rounded-full" style={{ width: `${Math.min(ia.percentage, 100)}%` }} />
                                </div>
                                <span className="font-bold text-brand-700">{formatPercent(ia.percentage)}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 text-right font-bold text-slate-900">
                            {ia.override_pct != null
                              ? formatCurrency((ia.override_pct / 100) * (apport?.invoices?.total_amount || 0))
                              : formatCurrency(ia.amount)
                            }
                          </td>
                          <td className="py-3 text-right">
                            {pp?.policy_limit ? (() => {
                              const limit      = Number(pp.policy_limit)
                              const cumulative = cumulativeByPeriod[ia.insurer_policy_period_id] || ia.amount
                              const cumPct     = (cumulative / limit) * 100
                              const thisPct    = (ia.amount / limit) * 100
                              const info       = exhaustionInfo(cumPct)
                              const alerted    = alertedThresholds[ia.insurer_policy_period_id] || new Set()
                              return (
                                <div className="flex flex-col items-end gap-1">
                                  <span className="text-sm font-medium text-slate-700">{formatCurrency(limit)}</span>
                                  {/* Cumulative progress bar */}
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-14 bg-slate-100 rounded-full h-1.5">
                                      <div className={`${info.barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(cumPct, 100)}%` }} />
                                    </div>
                                    <span className={`text-xs font-bold ${info.color}`}>{cumPct.toFixed(0)}%</span>
                                  </div>
                                  {cumPct >= 70 ? (
                                    <span className={`badge ${info.badge} text-xs`}>
                                      <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                                      {info.label}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">{thisPct.toFixed(0)}% this inv</span>
                                  )}
                                  {/* Alert badges */}
                                  {alerted.has(100) && (
                                    <span className="badge bg-red-100 text-red-700 text-xs">🔴 Exhausted</span>
                                  )}
                                  {!alerted.has(100) && alerted.has(95) && (
                                    <span className="badge bg-orange-100 text-orange-700 text-xs">🚨 95% alerted</span>
                                  )}
                                  {!alerted.has(95) && alerted.has(80) && (
                                    <span className="badge bg-amber-100 text-amber-700 text-xs">⚠️ 80% alerted</span>
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
                            <div className="flex flex-col items-center gap-1.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setOverrideModal({ ia, partyName: pa.parties?.name })}
                                  title={ia.override_pct != null ? `Override active: ${ia.override_pct?.toFixed(2)}% agreed — click to edit` : 'Set custom percentage override'}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    ia.override_pct != null
                                      ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                      : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  {ia.override_pct != null ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  onClick={() => openLetterModal(pa, ia)}
                                  title="Generate demand letter"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                </button>
                                {canRemind && (
                                  <button
                                    onClick={() => sendReminder(ia)}
                                    disabled={isSending}
                                    title={lastReminder
                                      ? `Send reminder (last: ${lastReminder.days_threshold || 'manual'}d · ${format(new Date(lastReminder.sent_at), 'MMM d')})`
                                      : 'Send payment reminder to insurer'}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      isSending
                                        ? 'text-slate-300 cursor-wait'
                                        : lastReminder
                                        ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
                                        : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                    }`}
                                  >
                                    {isSending
                                      ? <Clock className="h-3.5 w-3.5 animate-spin" />
                                      : <Bell className="h-3.5 w-3.5" />}
                                  </button>
                                )}
                                <button
                                  onClick={() => setPaymentModal({ ia, partyName: pa.parties?.name })}
                                  className={`badge cursor-pointer hover:opacity-80 transition-opacity ${paymentColor(ia.payment_status)}`}
                                >
                                  {paymentLabel(ia.payment_status)}
                                </button>
                              </div>
                              {/* Days outstanding badge */}
                              {days !== null && canRemind && (
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full leading-none ${tierColor}`}>
                                  {days}d outstanding
                                </span>
                              )}
                              {/* Last reminder sent */}
                              {lastReminder && (
                                <span className="text-xs text-slate-400 leading-none">
                                  Last: {lastReminder.triggered_by === 'manual' ? 'manual' : (lastReminder.schedule_type || `${lastReminder.days_threshold}d`)} · {format(new Date(lastReminder.sent_at), 'MMM d')}
                                </span>
                              )}
                              {/* Next auto follow-up */}
                              {(() => {
                                const next = nextFollowUp(ia, iaReminders, days)
                                if (!next) return null
                                const isOverdue = next <= new Date(new Date().setHours(0,0,0,0))
                                return (
                                  <span className={`text-xs leading-none font-medium ${isOverdue ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {isOverdue ? '⚡ Follow-up due' : `Next: ${format(next, 'MMM d')}`}
                                  </span>
                                )
                              })()}
                              {/* Push to Books buttons (shown when paid + provider connected) */}
                              {isPaid && availableProviders.length > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {availableProviders.map(provider => {
                                    const pushKey    = `${ia.id}:${provider}`
                                    const isPushing  = pushingBooks.has(pushKey)
                                    const alreadyPushed = iaPushes.some(p => p.provider === provider && p.status === 'success')
                                    const label      = provider === 'quickbooks' ? 'QBO' : 'Clio'
                                    return (
                                      <button
                                        key={provider}
                                        onClick={() => !alreadyPushed && pushToBooks(ia, provider)}
                                        disabled={isPushing || alreadyPushed}
                                        title={alreadyPushed
                                          ? `Already pushed to ${label} on ${format(new Date(iaPushes.find(p => p.provider === provider)?.pushed_at), 'MMM d')}`
                                          : `Push to ${label}`}
                                        className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded transition-colors ${
                                          alreadyPushed
                                            ? 'text-green-700 bg-green-100 cursor-default'
                                            : isPushing
                                            ? 'text-slate-400 bg-slate-100 cursor-wait'
                                            : 'text-slate-600 bg-slate-100 hover:bg-brand-100 hover:text-brand-700'
                                        }`}
                                      >
                                        {isPushing
                                          ? <Clock className="h-3 w-3 animate-spin" />
                                          : alreadyPushed
                                          ? <CheckCircle2 className="h-3 w-3" />
                                          : <PlugZap className="h-3 w-3" />}
                                        {label}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                              {/* Last push date */}
                              {lastPush?.status === 'failed' && (
                                <span className="text-xs text-red-500 leading-none">Push failed</span>
                              )}
                            </div>
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
                      <td colSpan={isTOR ? 6 : 5} className="pt-3 font-semibold text-slate-700 text-sm">Insured Subtotal</td>
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
                        <td colSpan={isTOR ? 7 : 6} className="pt-2 pb-3 text-amber-700 text-sm font-medium">
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
                  {isTOR && <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>}
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">{allocationLabel}</th>
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
                      {isTOR && <td className="py-2.5 text-right text-sm text-slate-600">{ia.days_on_risk}</td>}
                      <td className="py-2.5 text-right whitespace-nowrap text-sm text-brand-600 font-medium">{formatPercent(ia.percentage)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap text-sm text-slate-500">{formatPercent(pa.percentage)}</td>
                      <td className="py-2.5 text-right whitespace-nowrap font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={isTOR ? 5 : 4} className="pt-3 font-bold text-slate-900">Invoice Total</td>
                  <td className="pt-3 text-right whitespace-nowrap font-bold text-brand-700 text-xl">{formatCurrency(invoice.total_amount)}</td>
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

      {/* Bulk payment modal */}
      {bulkPaymentOpen && (
        <BulkPaymentModal
          partyApportionments={partyApps}
          matterId={matterId}
          apportionmentId={apportionmentId}
          onClose={() => setBulkPaymentOpen(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })}
        />
      )}

      {/* Payment modal */}
      {paymentModal && (
        <RecordPaymentModal
          ia={paymentModal.ia}
          partyName={paymentModal.partyName}
          matterId={matterId}
          onClose={() => setPaymentModal(null)}
          onSaved={(newStatus) => {
            qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })
            // Fire-and-forget notification (newStatus passed back from modal)
            if (newStatus) {
              api.sendEvent('payment_status_updated', profile.org_id, matterId, {
                insurer_name:     paymentModal.ia.insurers?.name,
                new_status:       newStatus,
                amount:           paymentModal.ia.amount
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(paymentModal.ia.amount)
                  : null,
                apportionment_id: apportionmentId,
              }).catch(() => {})
            }
          }}
        />
      )}

      {/* Demand letter modal */}
      {letterModal && (
        <DemandLetterModal
          data={letterModal}
          onClose={() => setLetterModal(null)}
          onDemanded={() => qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })}
        />
      )}

      {/* Override modal */}
      {overrideModal && (
        <OverrideModal
          ia={overrideModal.ia}
          partyName={overrideModal.partyName}
          invoiceTotal={apport?.invoices?.total_amount || 0}
          matterId={matterId}
          onClose={() => setOverrideModal(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['apportionment', apportionmentId] })}
        />
      )}
    </div>
  )
}
