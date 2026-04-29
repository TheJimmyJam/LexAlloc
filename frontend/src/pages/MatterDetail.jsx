import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { useForm, Controller } from 'react-hook-form'
import DateInput from '../components/DateInput.jsx'
import { formatCurrency, exhaustionInfo } from '../lib/calculations.js'
import { APPORTIONMENT_METHODS } from '../lib/apportionment.js'
import { logAudit, getActionMeta } from '../lib/audit.js'
import {
  ArrowLeft, Plus, Trash2, X, Upload, FileText,
  Users, Shield, Calculator, ChevronRight, Edit2, Check, TrendingUp, AlertTriangle,
  Paperclip, Download, ExternalLink, LayoutTemplate, Copy, BookOpen, Search,
  Bell, RefreshCcw, Loader2, Clock, Briefcase, DollarSign, Mail, Activity,
  MessageSquare, Flag, Phone, Pin, Send, AlertCircle, Scale
} from 'lucide-react'
import { format, parseISO, differenceInCalendarDays, addDays, startOfYear, addYears } from 'date-fns'
import toast from 'react-hot-toast'
import InvoiceUploadModal from '../components/InvoiceUploadModal.jsx'
import DocumentUploadModal, { DOC_TYPES } from '../components/DocumentUploadModal.jsx'
import { UseTemplateModal } from './Matters.jsx'
import { generateMatterSummaryReport } from '../lib/generateMatterSummaryReport.js'
import SettlementTab from '../components/SettlementTab.jsx'

// ── Policy Timeline ───────────────────────────────────────────────────────────
const TIMELINE_COLORS = [
  { bar: '#6366f1', bg: 'bg-indigo-500',  light: '#eef2ff', border: '#a5b4fc', text: 'text-indigo-700' },
  { bar: '#0ea5e9', bg: 'bg-sky-500',     light: '#f0f9ff', border: '#7dd3fc', text: 'text-sky-700'    },
  { bar: '#10b981', bg: 'bg-emerald-500', light: '#ecfdf5', border: '#6ee7b7', text: 'text-emerald-700'},
  { bar: '#f59e0b', bg: 'bg-amber-500',   light: '#fffbeb', border: '#fcd34d', text: 'text-amber-700'  },
  { bar: '#f43f5e', bg: 'bg-rose-500',    light: '#fff1f2', border: '#fda4af', text: 'text-rose-700'   },
  { bar: '#a855f7', bg: 'bg-purple-500',  light: '#faf5ff', border: '#d8b4fe', text: 'text-purple-700' },
]

function PolicyTimeline({ insurerPeriods, invoices, parties }) {
  const [hoveredId, setHoveredId] = useState(null)

  // Skip rows with no start date (template periods with no dates).
  // No policy_end = policy is still in effect; use today as the right edge.
  const rows = insurerPeriods.filter(pp => pp.policy_start)
  if (rows.length === 0) return null

  // Build party → color index map
  const partyColorMap = {}
  ;(parties || []).forEach((p, i) => { partyColorMap[p.id] = TIMELINE_COLORS[i % TIMELINE_COLORS.length] })

  // Invoice service windows (deduplicated, sorted)
  const serviceWindows = invoices
    .filter(inv => inv.service_start)
    .map(inv => ({
      label: inv.invoice_number ? `#${inv.invoice_number}` : 'Invoice',
      start: parseISO(inv.service_start),
      end:   parseISO(inv.service_end || inv.service_start),
    }))
    .sort((a, b) => a.start - b.start)

  // Overall date range — ongoing policies (no end date) use today
  const allStarts = rows.map(pp => parseISO(pp.policy_start))
  const allEnds   = rows.map(pp => pp.policy_end ? parseISO(pp.policy_end) : today)
  serviceWindows.forEach(w => { allStarts.push(w.start); allEnds.push(w.end) })
  const today = new Date()
  allEnds.push(today)

  const rangeMin = new Date(Math.min(...allStarts))
  const rangeMax = new Date(Math.max(...allEnds))
  // Add a small buffer on each side
  const bufferDays  = Math.max(30, differenceInCalendarDays(rangeMax, rangeMin) * 0.03)
  const chartStart  = addDays(rangeMin, -bufferDays)
  const chartEnd    = addDays(rangeMax,  bufferDays)
  const totalDays   = differenceInCalendarDays(chartEnd, chartStart) || 1

  const toPct = (date) => (differenceInCalendarDays(date, chartStart) / totalDays) * 100

  // Year tick marks
  const ticks = []
  let tick = startOfYear(addYears(chartStart, 1))
  while (tick < chartEnd) {
    ticks.push(tick)
    tick = addYears(tick, 1)
  }

  const todayPct  = Math.min(Math.max(toPct(today), 0), 100)
  const LABEL_W   = 160  // px, fixed label column

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Policy Timeline</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Policy periods per carrier — shaded bands show invoice service windows
          </p>
        </div>
        {/* Party color legend */}
        <div className="flex flex-wrap gap-3">
          {(parties || []).filter(p => rows.some(pp => pp.party_id === p.id)).map((p, i) => {
            const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length]
            return (
              <div key={p.id} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color.bar }} />
                <span className="text-xs text-slate-600">{p.name}</span>
              </div>
            )
          })}
          {serviceWindows.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0 bg-amber-300/60 border border-amber-400" />
              <span className="text-xs text-slate-600">Service period</span>
            </div>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: 600 }}>
          {/* Row area */}
          <div className="flex flex-col gap-2">
            {rows.map((pp) => {
              const color     = partyColorMap[pp.party_id] || TIMELINE_COLORS[0]
              const start     = parseISO(pp.policy_start)
              const isOngoing = !pp.policy_end
              const end       = isOngoing ? today : parseISO(pp.policy_end)
              const leftPct   = Math.max(toPct(start), 0)
              const rightPct  = Math.min(toPct(end), 100)
              const widthPct  = Math.max(rightPct - leftPct, 0.3)

              // Is this period triggered by any invoice service window?
              const triggered = serviceWindows.some(w => start <= w.end && end >= w.start)
              const isHovered = hoveredId === pp.id

              return (
                <div key={pp.id} className="flex items-center gap-3">
                  {/* Label */}
                  <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="text-right pr-2 flex-shrink-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{pp.insurers?.name}</p>
                    <p className="text-xs text-slate-400 truncate">{pp.parties?.name}</p>
                  </div>

                  {/* Bar track */}
                  <div className="flex-1 relative h-9 rounded-lg bg-slate-100 overflow-visible">
                    {/* Invoice service window overlays */}
                    {serviceWindows.map((w, wi) => {
                      const wLeft  = Math.max(toPct(w.start), 0)
                      const wRight = Math.min(toPct(w.end), 100)
                      const wWidth = Math.max(wRight - wLeft, 0.2)
                      return (
                        <div
                          key={wi}
                          className="absolute inset-y-0 rounded pointer-events-none"
                          style={{ left: `${wLeft}%`, width: `${wWidth}%`, backgroundColor: 'rgba(251,191,36,0.18)', borderLeft: '1.5px solid rgba(217,119,6,0.4)', borderRight: '1.5px solid rgba(217,119,6,0.4)' }}
                          title={`${w.label} service period`}
                        />
                      )
                    })}

                    {/* Policy bar */}
                    <div
                      className={`absolute inset-y-1 cursor-pointer transition-all ${isOngoing ? 'rounded-l' : 'rounded'}`}
                      style={{
                        left:            `${leftPct}%`,
                        width:           `${widthPct}%`,
                        backgroundColor: isHovered ? color.bar : color.bar + 'cc',
                        boxShadow:       isHovered ? `0 0 0 2px white, 0 0 0 3px ${color.bar}` : undefined,
                        borderRight:     isOngoing ? `2px dashed ${color.bar}` : undefined,
                      }}
                      onMouseEnter={() => setHoveredId(pp.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      title={`${pp.insurers?.name}\n${format(start, 'MM/dd/yyyy')} – ${isOngoing ? 'Present (ongoing)' : format(end, 'MM/dd/yyyy')}\n${differenceInCalendarDays(end, start)} days`}
                    >
                      {/* Triggered badge */}
                      {triggered && !isOngoing && widthPct > 8 && (
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white text-xs font-semibold opacity-80">
                          ✓
                        </span>
                      )}
                      {/* Ongoing pulse dot */}
                      {isOngoing && (
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-white opacity-90" />
                        </span>
                      )}
                    </div>

                    {/* Today line */}
                    {todayPct > 0 && todayPct < 100 && (
                      <div
                        className="absolute inset-y-0 w-px bg-red-400 pointer-events-none z-10"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}
                  </div>

                  {/* Duration label */}
                  <div style={{ width: 80, minWidth: 80 }} className="text-xs text-slate-400 flex-shrink-0">
                    {differenceInCalendarDays(end, start)}d
                    {isOngoing && <span className="ml-1 text-emerald-600 font-semibold">Active</span>}
                    {!isOngoing && triggered && <span className="ml-1 text-green-600 font-semibold">triggered</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* X-axis */}
          <div className="flex items-start mt-2" style={{ paddingLeft: LABEL_W + 12 }}>
            <div className="flex-1 relative h-5">
              {/* Start / end labels */}
              <span className="absolute left-0 text-xs text-slate-400">{format(chartStart, 'MM/yyyy')}</span>
              <span className="absolute right-0 text-xs text-slate-400 text-right">{format(chartEnd, 'MM/yyyy')}</span>
              {/* Year ticks */}
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute text-xs text-slate-400 -translate-x-1/2"
                  style={{ left: `${toPct(t)}%` }}
                >
                  {format(t, 'yyyy')}
                </span>
              ))}
              {/* Today label */}
              {todayPct > 5 && todayPct < 95 && (
                <span
                  className="absolute text-xs text-red-400 font-medium -translate-x-1/2"
                  style={{ left: `${todayPct}%`, top: 0 }}
                >
                  today
                </span>
              )}
            </div>
            <div style={{ width: 80 }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
const ALL_TABS = [
  { key: 'overview',      label: 'Overview',      icon: FileText,       templateOnly: false },
  { key: 'financials',    label: 'Financials',     icon: TrendingUp,     templateOnly: false },
  { key: 'parties',       label: 'Parties',        icon: Users,          templateOnly: false },
  { key: 'invoices',      label: 'Invoices',       icon: Upload,         templateOnly: false },
  { key: 'apportionments',label: 'Apportionments', icon: Calculator,     templateOnly: false },
  { key: 'settlement',    label: 'Settlement',     icon: Scale,          templateOnly: false },
  { key: 'documents',     label: 'Documents',      icon: Paperclip,      templateOnly: false },
  { key: 'notes',         label: 'Notes',          icon: MessageSquare,  templateOnly: false },
  { key: 'activity',      label: 'Activity',       icon: Clock,          templateOnly: false },
]
// Tabs hidden when viewing a template (template has no invoices, apportionments, or financial data)
const TEMPLATE_HIDDEN_TABS = new Set(['financials', 'invoices', 'apportionments', 'settlement'])

const PAYMENT_STATUS_COLORS = {
  pending:       'bg-slate-100 text-slate-600',
  demanded:      'bg-amber-100 text-amber-700',
  paid:          'bg-green-100 text-green-700',
  partially_paid:'bg-blue-100 text-blue-700',
  disputed:      'bg-red-100 text-red-700',
}
const PAYMENT_STATUS_LABELS = {
  pending: 'Pending', demanded: 'Demanded', paid: 'Paid',
  partially_paid: 'Partial', disputed: 'Disputed',
}

// ── Edit Matter Modal ─────────────────────────────────────────────────────────
function EditMatterModal({ matter, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name:          matter.name,
      matter_number: matter.matter_number || '',
      firm_id:       matter.firm_id       || '',
      description:   matter.description  || '',
      status:        matter.status,
    }
  })

  const { data: firms = [] } = useQuery({
    queryKey: ['firms', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase.from('la_firms').select('id, name').eq('org_id', profile.org_id).order('name')
      return data || []
    },
  })

  const onSubmit = async (values) => {
    const selectedFirm = firms.find(f => f.id === values.firm_id)
    const { error } = await supabase.from('la_matters').update({
      name:          values.name,
      matter_number: values.matter_number || null,
      firm_id:       values.firm_id       || null,
      firm_name:     selectedFirm?.name   || null,
      description:   values.description  || null,
      status:        values.status,
      updated_at:    new Date().toISOString(),
    }).eq('id', matter.id)
    if (error) { toast.error(error.message); return }
    toast.success('Matter updated!')
    qc.invalidateQueries({ queryKey: ['matter', matter.id] })
    qc.invalidateQueries({ queryKey: ['matters'] })
    qc.invalidateQueries({ queryKey: ['recent-matters'] })
    qc.invalidateQueries({ queryKey: ['dashboard-firms'] })
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${matter.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('la_matters').delete().eq('id', matter.id)
    if (error) { toast.error(error.message); return }
    toast.success('Matter deleted')
    qc.invalidateQueries({ queryKey: ['matters'] })
    navigate('/matters')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Edit Matter</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Firm</label>
            <select className="form-input" {...register('firm_id')}>
              <option value="">— No firm —</option>
              {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Matter Number</label>
            <input className="form-input" placeholder="2025-MDN-0047"
              {...register('matter_number')} />
          </div>
          <div>
            <label className="form-label">Matter Name *</label>
            <input className="form-input"
              {...register('name', { required: 'Matter name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input h-20 resize-none"
              {...register('description')} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" {...register('status')}>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handleDelete}
            className="w-full text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-4 py-2 transition-colors border border-red-200"
          >
            <Trash2 className="h-3.5 w-3.5 inline mr-1.5" />
            Delete this matter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Party Modal ──────────────────────────────────────────────────────────
function EditPartyModal({ party, matterId, allParties = [], onClose }) {
  const qc = useQueryClient()
  const { register, control, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name:               party.name,
      share_percentage:   party.share_percentage,
      notes:              party.notes              || '',
      responsible_start:  party.responsible_start  || '',
      responsible_end:    party.responsible_end    || '',
    }
  })

  const otherTotal  = allParties.filter(p => p.id !== party.id).reduce((s, p) => s + (p.share_percentage || 0), 0)
  const watchedPct  = parseFloat(watch('share_percentage')) || 0
  const newTotal    = parseFloat((otherTotal + watchedPct).toFixed(4))
  const remaining   = parseFloat((100 - newTotal).toFixed(4))
  const shareStatus = Math.abs(newTotal - 100) < 0.01
    ? { msg: 'Shares fully allocated — all parties sum to 100%', color: 'text-green-600' }
    : newTotal > 100
    ? { msg: `Over-allocated by ${Math.abs(remaining).toFixed(2)}% — total across all parties would be ${newTotal.toFixed(2)}%`, color: 'text-red-600' }
    : { msg: `${remaining.toFixed(2)}% remaining to allocate — total across all parties would be ${newTotal.toFixed(2)}%`, color: 'text-amber-600' }

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_parties').update({
      name:               values.name,
      share_percentage:   parseFloat(values.share_percentage),
      notes:              values.notes,
      responsible_start:  values.responsible_start || null,
      responsible_end:    values.responsible_end   || null,
    }).eq('id', party.id)
    if (error) { toast.error(error.message); return }
    toast.success('Party updated!')
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Edit Party</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Party Name *</label>
            <input className="form-input" placeholder="Acme Corporation"
              {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Share Percentage (%)</label>
            <input type="number" step="0.01" min="0" max="100"
              className={`form-input ${newTotal > 100 ? 'border-red-400 focus:ring-red-300' : ''}`}
              placeholder="50.00"
              {...register('share_percentage', {
                required: 'Share percentage is required',
                min: { value: 0,   message: 'Share cannot be negative' },
                max: { value: 100, message: 'Share cannot exceed 100%' },
              })} />
            {errors.share_percentage
              ? <p className="text-red-500 text-xs mt-1">{errors.share_percentage.message}</p>
              : allParties.length > 1 && watchedPct > 0 && (
                  <p className={`text-xs mt-1 ${shareStatus.color}`}>{shareStatus.msg}</p>
                )
            }
          </div>
          <div className="border-t border-slate-100 pt-4">
            <label className="form-label mb-1">Dates of Service Responsible For</label>
            <p className="text-xs text-slate-400 mb-3">Only invoices whose service period overlaps this range will include this party in the apportionment. Leave blank to include in all invoices.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-xs">From</label>
                <Controller name="responsible_start" control={control}
                  render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} className="w-full" />} />
              </div>
              <div>
                <label className="form-label text-xs">To</label>
                <Controller name="responsible_end" control={control}
                  rules={{ validate: v => { const start = watch('responsible_start'); return !v || !start || v >= start || 'End date must be on or after start date' } }}
                  render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.responsible_end} className="w-full" />} />
                {errors.responsible_end && <p className="text-red-500 text-xs mt-1">{errors.responsible_end.message}</p>}
              </div>
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input h-20 resize-none" {...register('notes')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Party Modal ───────────────────────────────────────────────────────────
function AddPartyModal({ matterId, existingParties = [], onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { register, control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { share_percentage: '', equalize: existingParties.length > 0 },
  })
  const currentTotal = existingParties.reduce((s, p) => s + (p.share_percentage || 0), 0)
  const watchedPct   = parseFloat(watch('share_percentage')) || 0
  const previewTotal = parseFloat((currentTotal + watchedPct).toFixed(4))
  const equalize     = watch('equalize')

  const onSubmit = async (values) => {
    const { data: inserted, error } = await supabase.from('la_parties').insert({
      matter_id:          matterId,
      org_id:             profile.org_id,
      name:               values.name,
      share_percentage:   parseFloat(values.share_percentage) || 0,
      notes:              values.notes,
      responsible_start:  values.responsible_start || null,
      responsible_end:    values.responsible_end   || null,
    }).select().single()
    if (error) { toast.error(error.message); return }

    // If equalize is checked, redistribute evenly across all parties (including new one)
    if (values.equalize && inserted) {
      const allParties = [...existingParties, inserted]
      const equal     = parseFloat((100 / allParties.length).toFixed(4))
      const remainder = parseFloat((100 - equal * (allParties.length - 1)).toFixed(4))
      await Promise.all(allParties.map((p, i) =>
        supabase.from('la_parties').update({
          share_percentage: i === allParties.length - 1 ? remainder : equal,
        }).eq('id', p.id)
      ))
      toast.success('Party added and shares equalized!')
    } else {
      toast.success('Party added!')
    }

    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Add Party</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Party Name *</label>
            <input className="form-input" placeholder="Acme Corporation"
              {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          {/* Only show % field if equalize is off */}
          {!equalize && (
            <div>
              <label className="form-label">Share Percentage (%)</label>
              <input type="number" step="0.01" min="0" max="100" className="form-input"
                placeholder="0.00"
                {...register('share_percentage', { min: 0, max: 100 })} />
              {watchedPct > 0 && (
                <p className={`text-xs mt-1 ${
                  Math.abs(previewTotal - 100) < 0.01 ? 'text-green-600'
                  : previewTotal > 100 ? 'text-red-600'
                  : 'text-amber-600'
                }`}>
                  {Math.abs(previewTotal - 100) < 0.01
                    ? 'Shares fully allocated — all parties will sum to 100%'
                    : previewTotal > 100
                    ? `Over-allocated by ${(previewTotal - 100).toFixed(2)}% — reduce this or another party's share`
                    : `${(100 - previewTotal).toFixed(2)}% remaining after adding — total would be ${previewTotal.toFixed(2)}%`
                  }
                </p>
              )}
            </div>
          )}

          {/* Equalize toggle */}
          {existingParties.length > 0 && (
            <label className="flex items-start gap-3 cursor-pointer group">
              <input type="checkbox" className="mt-0.5 accent-violet-600" {...register('equalize')} />
              <div>
                <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                  Equalize all parties after adding
                </p>
                <p className="text-xs text-slate-400">
                  Splits 100% evenly across all {existingParties.length + 1} parties ({parseFloat((100 / (existingParties.length + 1)).toFixed(2))}% each)
                </p>
              </div>
            </label>
          )}

          <div className="border-t border-slate-100 pt-4">
            <label className="form-label mb-1">Dates of Service Responsible For</label>
            <p className="text-xs text-slate-400 mb-3">Only invoices whose service period overlaps this range will include this party in the apportionment. Leave blank to include in all invoices.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-xs">From</label>
                <Controller name="responsible_start" control={control}
                  render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} className="w-full" />} />
              </div>
              <div>
                <label className="form-label text-xs">To</label>
                <Controller name="responsible_end" control={control}
                  rules={{ validate: v => { const start = watch('responsible_start'); return !v || !start || v >= start || 'End date must be on or after start date' } }}
                  render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.responsible_end} className="w-full" />} />
                {errors.responsible_end && <p className="text-red-500 text-xs mt-1">{errors.responsible_end.message}</p>}
              </div>
            </div>
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input h-20 resize-none" {...register('notes')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Currency input — formats as $x,xxx,xxx while typing ──────────────────────
function CurrencyInput({ value, onChange, onBlur, placeholder }) {
  const fmt = (raw) => {
    const digits = String(raw ?? '').replace(/[^0-9]/g, '')
    if (!digits) return ''
    return '$' + parseInt(digits, 10).toLocaleString('en-US')
  }
  const [display, setDisplay] = useState(() => fmt(value))

  const handleChange = (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, '')
    if (!digits) { setDisplay(''); onChange(''); return }
    const num = parseInt(digits, 10)
    setDisplay('$' + num.toLocaleString('en-US'))
    onChange(String(num))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="form-input"
      value={display}
      onChange={handleChange}
      onBlur={onBlur}
      placeholder={placeholder || '$0'}
    />
  )
}

// ── Shared insurer policy period fields (used by Add and Edit modals) ────────
// Returns true when the insurer's responsible dates extend beyond the party's.
// "Broader" = starts earlier OR ends later OR is ongoing while the party has ended.
function isOverbroad(instrStart, instrEnd, partyStart, partyEnd) {
  if (!partyStart && !partyEnd) return false          // party has no dates → no constraint
  if (partyStart && instrStart && instrStart < partyStart) return true
  if (partyEnd   && instrEnd   && instrEnd   > partyEnd)   return true
  if (partyEnd   && !instrEnd)                        return true  // insurer ongoing, party closed
  return false
}

function InsurerPolicyFields({ register, control, errors = {}, watch, partyResponsibleStart, partyResponsibleEnd, isAdmin }) {
  const policyStart      = watch?.('policy_start')
  const responsibleStart = watch?.('responsible_start')
  const instrStart       = watch?.('responsible_start') || ''
  const instrEnd         = watch?.('responsible_end')   || ''
  const overrideChecked  = watch?.('date_range_override') || false

  const overbroad = isOverbroad(instrStart, instrEnd, partyResponsibleStart, partyResponsibleEnd)

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Coverage Start *</label>
          <Controller name="policy_start" control={control}
            rules={{ required: 'Start date is required to calculate time on risk' }}
            render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.policy_start} className="w-full" />} />
          {errors.policy_start && <p className="text-red-500 text-xs mt-1">{errors.policy_start.message}</p>}
        </div>
        <div>
          <label className="form-label">Coverage End <span className="text-slate-400 font-normal">(blank = still active)</span></label>
          <Controller name="policy_end" control={control}
            rules={{ validate: v => !v || !policyStart || v >= policyStart || 'End date must be on or after the start date' }}
            render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.policy_end} className="w-full" />} />
          {errors.policy_end && <p className="text-red-500 text-xs mt-1">{errors.policy_end.message}</p>}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <label className="form-label mb-1">Dates of Service Responsible For</label>
        <p className="text-xs text-slate-400 mb-3">Only invoices whose service period overlaps this range will include this insurer in the apportionment. Leave blank to include in all invoices.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="form-label text-xs">From</label>
            <Controller name="responsible_start" control={control}
              render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} className="w-full" />} />
          </div>
          <div>
            <label className="form-label text-xs">To</label>
            <Controller name="responsible_end" control={control}
              rules={{ validate: v => !v || !responsibleStart || v >= responsibleStart || 'End date must be on or after start date' }}
              render={({ field }) => <DateInput value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.responsible_end} className="w-full" />} />
            {errors.responsible_end && <p className="text-red-500 text-xs mt-1">{errors.responsible_end.message}</p>}
          </div>
        </div>
      </div>
      <div>
        <label className="form-label">
          Policy Limit
          <span className="ml-1.5 text-slate-400 font-normal text-xs">— required for Limits-Proportional apportionment</span>
        </label>
        <Controller name="policy_limit" control={control} defaultValue=""
          render={({ field }) => (
            <CurrencyInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} placeholder="$1,000,000" />
          )} />
      </div>
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Contact Info</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Claim Number</label>
            <input className="form-input" placeholder="CLM-2024-001234"
              {...register('claim_number')} />
          </div>
          <div>
            <label className="form-label">Claims Rep Name</label>
            <input className="form-input" placeholder="Jane Smith"
              {...register('claims_rep_name')} />
          </div>
        </div>
        <div className="mt-4">
          <label className="form-label">Claims Rep Email</label>
          <input type="email" className={`form-input ${errors.claims_rep_email ? 'border-red-400' : ''}`}
            placeholder="jsmith@travelers.com"
            {...register('claims_rep_email', {
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address' }
            })} />
          {errors.claims_rep_email && <p className="text-red-500 text-xs mt-1">{errors.claims_rep_email.message}</p>}
        </div>
        <div className="mt-4">
          <label className="form-label">Insurance Portal URL</label>
          <input type="url" className={`form-input ${errors.portal_url ? 'border-red-400' : ''}`}
            placeholder="https://claims.travelers.com"
            {...register('portal_url', {
              pattern: { value: /^https?:\/\/.+/, message: 'URL must start with http:// or https://' }
            })} />
          {errors.portal_url && <p className="text-red-500 text-xs mt-1">{errors.portal_url.message}</p>}
        </div>
      </div>

      {/* ── Date-range overbroad flag ── */}
      {overbroad && (
        <div className={`flex items-start gap-2.5 rounded-lg p-3 text-sm border ${
          isAdmin
            ? 'bg-amber-50 border-amber-200 text-amber-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">Insurer dates extend beyond party's responsible period</p>
            <p className="text-xs mt-0.5 opacity-75">
              The insurer's "Dates of Service Responsible For" is broader than the party's responsible date range.
              This can cause incorrect apportionment results.
            </p>
            {isAdmin ? (
              <label className="flex items-center gap-2 mt-2 text-xs font-medium cursor-pointer select-none">
                <input type="checkbox" {...register('date_range_override')} className="rounded" />
                Override — I confirm these broader dates are intentional
              </label>
            ) : (
              <p className="text-xs mt-1.5 font-semibold">
                Only an admin can override this restriction.
              </p>
            )}
          </div>
        </div>
      )}
      {/* Keep the override value registered even when not overbroad */}
      {!overbroad && <input type="hidden" {...register('date_range_override')} />}
    </>
  )
}

// ── Edit Insurer Modal ────────────────────────────────────────────────────────
function EditInsurerModal({ pp, matterId, onClose }) {
  const qc = useQueryClient()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { register, control, watch, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      policy_start:        pp.policy_start,
      policy_end:          pp.policy_end,
      responsible_start:   pp.responsible_start || pp.parties?.responsible_start || '',
      responsible_end:     pp.responsible_end   || pp.parties?.responsible_end   || '',
      policy_limit:        pp.policy_limit      ? String(Math.round(pp.policy_limit)) : '',
      claim_number:        pp.claim_number      || '',
      claims_rep_name:     pp.claims_rep_name   || '',
      claims_rep_email:    pp.claims_rep_email  || '',
      portal_url:          pp.portal_url        || '',
      date_range_override: pp.date_range_override || false,
    }
  })

  const instrStart      = watch('responsible_start') || ''
  const instrEnd        = watch('responsible_end')   || ''
  const overrideChecked = watch('date_range_override') || false
  const partyStart      = pp.parties?.responsible_start || ''
  const partyEnd        = pp.parties?.responsible_end   || ''
  const overbroad       = isOverbroad(instrStart, instrEnd, partyStart, partyEnd)
  const isBlocked       = overbroad && !isAdmin && !overrideChecked

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_insurer_policy_periods').update({
      policy_start:        values.policy_start,
      policy_end:          values.policy_end,
      responsible_start:   values.responsible_start || null,
      responsible_end:     values.responsible_end   || null,
      policy_limit:        values.policy_limit       ? parseFloat(values.policy_limit) : null,
      claim_number:        values.claim_number       || null,
      claims_rep_name:     values.claims_rep_name    || null,
      claims_rep_email:    values.claims_rep_email   || null,
      portal_url:          values.portal_url         || null,
      date_range_override: values.date_range_override || false,
    }).eq('id', pp.id)
    if (error) { toast.error(error.message); return }
    logAudit({ profile, matterId, action: 'insurer.updated', entityType: 'insurer', entityId: pp.id, entityName: pp.insurers?.name, metadata: { party: pp.parties?.name, policy_limit: values.policy_limit || null } })
    toast.success('Policy period updated!')
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg">Edit Policy Period</h2>
            <p className="text-sm text-slate-500 mt-0.5">{pp.insurers?.name} · {pp.parties?.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <InsurerPolicyFields
            register={register} control={control} errors={errors} watch={watch}
            partyResponsibleStart={partyStart} partyResponsibleEnd={partyEnd} isAdmin={isAdmin}
          />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting || isBlocked}
              title={isBlocked ? 'Insurer dates exceed party range — admin override required' : undefined}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Insurer Modal ─────────────────────────────────────────────────────────
// ── Insurer combobox ──────────────────────────────────────────────────────────
function InsurerCombobox({ orgId, value, onChange, hasError }) {
  const [query,    setQuery]    = useState(value || '')
  const [open,     setOpen]     = useState(false)
  const [focused,  setFocused]  = useState(false)
  const wrapRef = React.useRef(null)

  const { data: allInsurers = [] } = useQuery({
    queryKey: ['insurers-directory', orgId],
    queryFn:  async () => {
      const { data } = await supabase
        .from('la_insurers')
        .select('id, name')
        .eq('org_id', orgId)
        .order('name')
      return data || []
    },
    enabled: !!orgId,
  })

  const filtered = query.trim().length === 0
    ? allInsurers
    : allInsurers.filter(i => i.name.toLowerCase().includes(query.toLowerCase()))

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (name) => {
    setQuery(name)
    onChange(name)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        className={`form-input w-full ${hasError ? 'border-red-400' : ''}`}
        placeholder="Travelers Indemnity Company"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => { setFocused(true); setOpen(true) }}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400 italic">
              No matches — type any name to create a new insurer
            </div>
          ) : (
            filtered.map(ins => (
              <button
                key={ins.id}
                type="button"
                onMouseDown={() => select(ins.name)}
                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                {ins.name}
              </button>
            ))
          )}
          {query.trim() && !allInsurers.some(i => i.name.toLowerCase() === query.trim().toLowerCase()) && (
            <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400 flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              <span>Press Enter or click Add to create <strong className="text-slate-600">"{query.trim()}"</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AddInsurerModal({ matterId, parties, defaultPartyId = null, onClose }) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const qc = useQueryClient()
  const { register, control, watch, handleSubmit, setValue, formState: { errors, isSubmitting, dirtyFields } } = useForm({
    defaultValues: { party_id: defaultPartyId || '', insurer_name: '' },
  })
  const [selectedInsurerId, setSelectedInsurerId] = useState(null) // known id from directory

  // Auto-populate responsible dates from the selected party (only if user hasn't manually overridden them)
  const watchedPartyId = watch('party_id')
  useEffect(() => {
    const selectedParty = parties?.find(p => p.id === watchedPartyId)
    if (!selectedParty) return
    if (!dirtyFields.responsible_start) setValue('responsible_start', selectedParty.responsible_start || '')
    if (!dirtyFields.responsible_end)   setValue('responsible_end',   selectedParty.responsible_end   || '')
  }, [watchedPartyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedParty   = parties?.find(p => p.id === watchedPartyId) || parties?.find(p => p.id === defaultPartyId)
  const partyStart      = selectedParty?.responsible_start || ''
  const partyEnd        = selectedParty?.responsible_end   || ''
  const instrStart      = watch('responsible_start') || ''
  const instrEnd        = watch('responsible_end')   || ''
  const overrideChecked = watch('date_range_override') || false
  const overbroad       = isOverbroad(instrStart, instrEnd, partyStart, partyEnd)
  const isBlocked       = overbroad && !isAdmin && !overrideChecked

  const onSubmit = async (values) => {
    let insurerId = null

    {
      // Find by name or create new
      const { data: existing } = await supabase
        .from('la_insurers')
        .select('id')
        .eq('org_id', profile.org_id)
        .eq('name', values.insurer_name)
        .single()

      if (existing) {
        insurerId = existing.id
      } else {
        const { data: newIns, error } = await supabase.from('la_insurers').insert({
          org_id:        profile.org_id,
          name:          values.insurer_name,
          policy_number: values.policy_number || null,
        }).select().single()
        if (error) { toast.error(error.message); return }
        insurerId = newIns.id
      }
    }

    // Create policy period with contact info
    const { error: ppErr } = await supabase.from('la_insurer_policy_periods').insert({
      insurer_id:          insurerId,
      party_id:            values.party_id,
      matter_id:           matterId,
      org_id:              profile.org_id,
      policy_start:        values.policy_start,
      policy_end:          values.policy_end,
      responsible_start:   values.responsible_start || null,
      responsible_end:     values.responsible_end   || null,
      policy_limit:        values.policy_limit       ? parseFloat(values.policy_limit) : null,
      claim_number:        values.claim_number       || null,
      claims_rep_name:     values.claims_rep_name    || null,
      claims_rep_email:    values.claims_rep_email   || null,
      portal_url:          values.portal_url         || null,
      date_range_override: values.date_range_override || false,
    })
    if (ppErr) { toast.error(ppErr.message); return }
    const party = parties.find(p => p.id === values.party_id)
    logAudit({ profile, matterId, action: 'insurer.added', entityType: 'insurer', entityId: insurerId, entityName: values.insurer_name, metadata: { party: party?.name, policy_limit: values.policy_limit || null, policy_start: values.policy_start, policy_end: values.policy_end } })
    toast.success('Insurer & policy period added!')
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Add Insurer & Policy Period</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Insurer Name *</label>
            <Controller
              name="insurer_name"
              control={control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <InsurerCombobox
                  orgId={profile?.org_id}
                  value={field.value}
                  onChange={field.onChange}
                  hasError={!!errors.insurer_name}
                />
              )}
            />
            {errors.insurer_name && <p className="text-red-500 text-xs mt-1">{errors.insurer_name.message}</p>}
          </div>
          <div>
            <label className="form-label">Policy Number</label>
            <input className="form-input" placeholder="GL-2019-001234"
              {...register('policy_number')} />
          </div>
          {defaultPartyId ? (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm text-slate-700">
              <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold mr-2">Party:</span>
              {parties?.find(p => p.id === defaultPartyId)?.name || 'Selected party'}
              <input type="hidden" value={defaultPartyId} {...register('party_id', { required: 'Required' })} />
            </div>
          ) : (
            <div>
              <label className="form-label">Insured Party *</label>
              <select className="form-input" {...register('party_id', { required: 'Required' })}>
                <option value="">Select party…</option>
                {parties?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {errors.party_id && <p className="text-red-500 text-xs mt-1">{errors.party_id.message}</p>}
            </div>
          )}
          <InsurerPolicyFields
            register={register} control={control} errors={errors} watch={watch}
            partyResponsibleStart={partyStart} partyResponsibleEnd={partyEnd} isAdmin={isAdmin}
          />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting || isBlocked}
              title={isBlocked ? 'Insurer dates exceed party range — admin override required' : undefined}>
              {isSubmitting ? 'Adding…' : 'Add Insurer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


// ── Request Adjuster Info Modal ───────────────────────────────────────────────
function RequestAdjusterInfoModal({ matter, onClose }) {
  const { profile } = useAuth()
  const [emails, setEmails] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    const list = emails.split(/[,\n]+/).map(e => e.trim()).filter(Boolean)
    if (list.length === 0) { toast.error('Enter at least one email address'); return }
    setSending(true)
    try {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: {
          type:     'party_info_request',
          org_id:   profile.org_id,
          matter_id: matter.id,
          details: {
            matter_name:   matter.name,
            matter_number: matter.matter_number || null,
            to_emails:     list,
          },
        },
      })
      if (error) throw error
      toast.success(`Info request sent to ${list.length} recipient${list.length > 1 ? 's' : ''}`)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-start justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Request Info from Relevant Parties</h2>
            <p className="text-sm text-slate-400 mt-0.5">Send an email asking for coverage details</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-700">
            The email will ask recipients to provide:
            <ul className="mt-1.5 space-y-0.5 list-disc list-inside text-blue-600">
              <li>Carrier name</li>
              <li>Dates of service they are responsible for</li>
              <li>Coverage period (policy start &amp; end)</li>
              <li>Policy limits</li>
            </ul>
          </div>
          <div>
            <label className="form-label">Adjuster / Carrier Emails</label>
            <textarea
              className="form-input h-24 resize-none"
              placeholder={"adjuster@carrier.com\nadjuster2@carrier.com"}
              value={emails}
              onChange={e => setEmails(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">One email per line, or comma-separated</p>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={handleSend} disabled={sending} className="btn-primary flex-1 justify-center">
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send Request</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MatterDetail() {
  const { matterId } = useParams()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [showEditMatter, setShowEditMatter] = useState(false)
  const [showAddParty, setShowAddParty] = useState(false)
  const [editingParty, setEditingParty] = useState(null)
  const [editingPct, setEditingPct] = useState({})   // { [partyId]: stringValue }
  const [showAddInsurer, setShowAddInsurer] = useState(false)
  const [addInsurerForParty, setAddInsurerForParty] = useState(null) // party object — opens modal pre-scoped
  const [expandedParties, setExpandedParties] = useState(new Set())
  const [showUploadDoc, setShowUploadDoc] = useState(false)
  const [editingInsurer, setEditingInsurer] = useState(null)
  const [showUploadInvoice, setShowUploadInvoice] = useState(false)
  const [invoiceDropFiles, setInvoiceDropFiles]   = useState([])
  const [invoiceDragOver,  setInvoiceDragOver]    = useState(false)
  const [showUseTemplate, setShowUseTemplate] = useState(false)
  const [showAdjusterModal, setShowAdjusterModal] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // Auto-open Add Party modal when navigated from invoice creation
  useEffect(() => {
    if (searchParams.get('promptParties') === '1') {
      setTab('parties')
      setShowAddParty(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  const { data: matter, isLoading } = useQuery({
    queryKey: ['matter', matterId],
    queryFn: async () => {
      const { data } = await supabase.from('la_matters').select('*, la_firms(id, name)').eq('id', matterId).single()
      return data
    }
  })

  const { data: parties = [] } = useQuery({
    queryKey: ['matter-parties', matterId],
    queryFn: async () => {
      const { data } = await supabase.from('la_parties').select('*').eq('matter_id', matterId).order('created_at')
      return data || []
    }
  })

  const { data: insurerPeriods = [] } = useQuery({
    queryKey: ['matter-insurers', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurer_policy_periods')
        .select('*, insurers:la_insurers(name, policy_number), parties:la_parties(name, responsible_start, responsible_end)')
        .eq('matter_id', matterId)
        .order('policy_start')
      return data || []
    }
  })

  // Policy limit alert log — which thresholds have already been alerted
  const { data: limitAlerts = [], refetch: refetchLimitAlerts } = useQuery({
    queryKey: ['policy-limit-alerts', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_policy_limit_alerts')
        .select('policy_period_id, threshold, alerted_at, pct_exhausted')
        .eq('matter_id', matterId)
      return data || []
    },
    enabled: !!matterId,
  })

  // Map: policy_period_id → Set of alerted thresholds
  const alertedThresholds = useMemo(() => {
    const map = {}
    for (const a of limitAlerts) {
      if (!map[a.policy_period_id]) map[a.policy_period_id] = new Set()
      map[a.policy_period_id].add(a.threshold)
    }
    return map
  }, [limitAlerts])

  // Audit log for the Activity tab
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['matter-audit', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_audit_logs')
        .select('*')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
        .limit(200)
      return data || []
    },
    enabled: !!matterId,
  })

  // Matter Notes
  const { data: matterNotes = [], refetch: refetchNotes } = useQuery({
    queryKey: ['matter-notes', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matter_notes')
        .select('*')
        .eq('matter_id', matterId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
      return data || []
    },
    enabled: !!matterId,
  })
  const [noteContent,  setNoteContent]  = useState('')
  const [noteType,     setNoteType]     = useState('note')
  const [submittingNote, setSubmittingNote] = useState(false)

  const submitNote = async () => {
    if (!noteContent.trim() || !profile) return
    setSubmittingNote(true)
    try {
      const { error } = await supabase.from('la_matter_notes').insert({
        org_id:     matter.org_id,
        matter_id:  matterId,
        user_id:    profile.id,
        user_name:  profile.full_name || profile.email,
        user_email: profile.email,
        content:    noteContent.trim(),
        note_type:  noteType,
      })
      if (error) throw error
      setNoteContent('')
      setNoteType('note')
      refetchNotes()
    } catch (err) {
      toast.error('Failed to save note')
    } finally {
      setSubmittingNote(false)
    }
  }

  const togglePinNote = async (note) => {
    await supabase.from('la_matter_notes').update({ is_pinned: !note.is_pinned }).eq('id', note.id)
    refetchNotes()
  }

  const deleteNote = async (noteId) => {
    await supabase.from('la_matter_notes').delete().eq('id', noteId)
    refetchNotes()
  }

  const [checkingLimits, setCheckingLimits] = useState(false)
  const checkLimitsNow = async () => {
    setCheckingLimits(true)
    try {
      const { data, error } = await supabase.functions.invoke('check-policy-limits', {
        body: { matter_id: matterId },
      })
      if (error) throw new Error(error.message)
      const fired = data?.alerts_fired?.length ?? 0
      if (fired > 0) {
        toast.success(`${fired} new alert${fired !== 1 ? 's' : ''} sent`)
      } else {
        toast.success('All limits checked — no new thresholds crossed')
      }
      refetchLimitAlerts()
    } catch (err) {
      toast.error('Check failed: ' + (err.message || 'Unknown error'))
    } finally {
      setCheckingLimits(false)
    }
  }

  const { data: invoices = [] } = useQuery({
    queryKey: ['matter-invoices', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_invoices')
        .select('*')
        .eq('matter_id', matterId)
        .order('invoice_date', { ascending: false })
      return data || []
    }
  })

  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ['matter-documents', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matter_documents')
        .select('*, uploader:la_profiles(first_name, last_name)')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: apportionments = [] } = useQuery({
    queryKey: ['matter-apportionments', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select('*, invoices:la_invoices(invoice_number, total_amount)')
        .eq('matter_id', matterId)
        .order('calculated_at', { ascending: false })
      return data || []
    }
  })

  // Financials — full payment breakdown across all apportionments
  const { data: financialRows = [] } = useQuery({
    queryKey: ['matter-financials', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select(`
          id, calculated_at,
          invoices:la_invoices(id, invoice_number, invoice_date, total_amount),
          party_apportionments:la_party_apportionments(
            id, amount,
            parties:la_parties(name),
            insurer_apportionments:la_insurer_apportionments(
              id, amount, amount_paid, payment_status, demanded_at, payment_date,
              insurer_policy_period_id,
              insurers:la_insurers(id, name, policy_number)
            )
          )
        `)
        .eq('matter_id', matterId)
        .order('calculated_at', { ascending: false })
      return data || []
    }
  })

  const deleteParty = async (id) => {
    const target      = parties.find(p => p.id === id)
    const remaining   = parties.filter(p => p.id !== id)
    const freedPct    = target?.share_percentage || 0
    const msg         = freedPct > 0 && remaining.length > 0
      ? `Remove ${target?.name}? Their ${freedPct}% share will be freed.\n\nClick OK to redistribute it evenly, or Cancel to just remove.`
      : `Remove ${target?.name || 'this party'}?`
    const confirmed = confirm(msg)
    if (!confirmed) return

    await supabase.from('la_parties').delete().eq('id', id)
    logAudit({ profile, matterId, action: 'party.deleted', entityType: 'party', entityId: id, entityName: target?.name, metadata: { share_percentage: freedPct } })

    // Redistribute freed % evenly among remaining parties
    if (freedPct > 0 && remaining.length > 0) {
      const share      = parseFloat((freedPct / remaining.length).toFixed(4))
      const adjustment = parseFloat((freedPct - share * (remaining.length - 1)).toFixed(4))
      await Promise.all(remaining.map((p, i) =>
        supabase.from('la_parties').update({
          share_percentage: parseFloat((p.share_percentage + (i === remaining.length - 1 ? adjustment : share)).toFixed(4)),
        }).eq('id', p.id)
      ))
      toast.success(`Party removed — ${freedPct}% redistributed`)
    } else {
      toast.success('Party removed')
    }

    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
  }

  const deleteInsurer = async (id) => {
    if (!confirm('Remove this policy period?')) return
    const target = insurerPeriods.find(p => p.id === id)
    await supabase.from('la_insurer_policy_periods').delete().eq('id', id)
    logAudit({ profile, matterId, action: 'insurer.deleted', entityType: 'insurer', entityId: id, entityName: target?.insurers?.name, metadata: { party: target?.parties?.name } })
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    toast.success('Policy period removed')
  }

  const equalizeShares = async () => {
    if (parties.length === 0) return
    const equal = parseFloat((100 / parties.length).toFixed(4))
    const remainder = parseFloat((100 - equal * (parties.length - 1)).toFixed(4))
    const updates = parties.map((p, i) =>
      supabase.from('la_parties').update({ share_percentage: i === parties.length - 1 ? remainder : equal }).eq('id', p.id)
    )
    await Promise.all(updates)
    logAudit({ profile, matterId, action: 'party.shares_equalized', entityType: 'party', metadata: { party_count: parties.length, equal_share: equal } })
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    toast.success('Shares equalized!')
  }

  const savePct = async (partyId, rawValue) => {
    const val = parseFloat(rawValue)
    if (isNaN(val) || val < 0 || val > 100) {
      setEditingPct(prev => { const n = {...prev}; delete n[partyId]; return n })
      toast.error('Percentage must be between 0 and 100')
      return
    }
    const rounded = parseFloat(val.toFixed(4))
    const oldPct  = parties.find(p => p.id === partyId)?.share_percentage
    const partyName = parties.find(p => p.id === partyId)?.name
    const { error } = await supabase.from('la_parties').update({ share_percentage: rounded }).eq('id', partyId)
    setEditingPct(prev => { const n = {...prev}; delete n[partyId]; return n })
    if (error) { toast.error(error.message); return }
    logAudit({ profile, matterId, action: 'party.percentage_changed', entityType: 'party', entityId: partyId, entityName: partyName, metadata: { old_pct: oldPct, new_pct: rounded } })
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
  }

  const splitRemaining = async () => {
    const remaining = parseFloat((100 - totalPartyPct).toFixed(4))
    if (remaining <= 0 || parties.length === 0) return
    const share = parseFloat((remaining / parties.length).toFixed(4))
    const updates = parties.map((p, i) => {
      const newPct = parseFloat((p.share_percentage + (i === parties.length - 1
        ? parseFloat((remaining - share * (parties.length - 1)).toFixed(4))
        : share)).toFixed(4))
      return supabase.from('la_parties').update({ share_percentage: newPct }).eq('id', p.id)
    })
    await Promise.all(updates)
    logAudit({ profile, matterId, action: 'party.remainder_split', entityType: 'party', metadata: { remaining_pct: remaining, party_count: parties.length } })
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    toast.success('Remaining % split evenly!')
  }

  // Cumulative amount owed per insurer across all apportionments (for exhaustion tracking)
  const owedByInsurerId = {}
  ;(financialRows || []).forEach(appt => {
    ;(appt.party_apportionments || []).forEach(pa => {
      ;(pa.insurer_apportionments || []).forEach(ia => {
        const key = ia.insurers?.id
        if (key) owedByInsurerId[key] = (owedByInsurerId[key] || 0) + (ia.amount || 0)
      })
    })
  })

  // Cumulative obligated amount keyed by policy_period_id (more precise — each period has its own limit)
  const obligatedByPeriodId = useMemo(() => {
    const map = {}
    ;(financialRows || []).forEach((appt) => {
      ;(appt.party_apportionments || []).forEach((pa) => {
        ;(pa.insurer_apportionments || []).forEach((ia) => {
          const key = ia.insurer_policy_period_id
          if (key) map[key] = (map[key] || 0) + (Number(ia.amount) || 0)
        })
      })
    })
    return map
  }, [financialRows])

  const totalPartyPct = parties.reduce((s, p) => s + (p.share_percentage || 0), 0)
  const statusColors = {
    active: 'bg-green-100 text-green-700', closed: 'bg-slate-100 text-slate-600',
    on_hold: 'bg-amber-100 text-amber-700', pending: 'bg-amber-100 text-amber-700',
    draft: 'bg-slate-100 text-slate-500', parsed: 'bg-blue-100 text-blue-700',
    apportioned: 'bg-purple-100 text-purple-700',
  }
  const STATUS_LABELS = { active: 'Active', closed: 'Closed', on_hold: 'On Hold', pending: 'On Hold' }

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading matter…</div>
  if (!matter)   return <div className="p-8 text-center text-slate-400">Matter not found.</div>

  const isTemplate = !!matter.is_template
  const TABS = ALL_TABS.filter(t => !isTemplate || !TEMPLATE_HIDDEN_TABS.has(t.key))

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/matters" className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Matters
        </Link>

        {/* Template banner */}
        {isTemplate && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4">
            <LayoutTemplate className="h-5 w-5 text-violet-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-800">This is a template</p>
              <p className="text-xs text-violet-600 mt-0.5">
                Configure parties and insurer assignments here, then use "Create Matter from Template" to spin up new matters instantly.
              </p>
            </div>
            <button
              onClick={() => setShowUseTemplate(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
            >
              <Copy className="h-4 w-4" />
              Create Matter from Template
            </button>
          </div>
        )}

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{matter.name}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {(matter.la_firms?.name || matter.firm_name) && <span className="mr-3 font-medium text-slate-600">{matter.la_firms?.name || matter.firm_name}</span>}
              {matter.matter_number && <span className="mr-3">#{matter.matter_number}</span>}
              {matter.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTemplate
              ? <span className="badge bg-violet-100 text-violet-700 text-sm px-3 py-1">Template</span>
              : <span className={`badge ${statusColors[matter.status] || 'bg-slate-100 text-slate-500'} text-sm px-3 py-1`}>{STATUS_LABELS[matter.status] ?? matter.status}</span>
            }
            {!isTemplate && (
              <button
                onClick={() => generateMatterSummaryReport({ matter, parties, insurerPeriods, invoices, financialRows }).catch(err => console.error('PDF error', err))}
                className="btn-secondary text-sm"
                title="Export Matter Summary PDF"
              >
                <Download className="h-4 w-4" /> Export PDF
              </button>
            )}
            <button
              onClick={() => setShowEditMatter(true)}
              className="btn-secondary text-sm"
              title="Edit matter"
            >
              <Edit2 className="h-4 w-4" /> Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (() => {
        const setDefaultMethod = async (method) => {
          await supabase.from('la_matters').update({ default_apportionment_method: method }).eq('id', matterId)
          qc.invalidateQueries({ queryKey: ['matter', matterId] })
          toast.success('Default apportionment method saved')
        }

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5 text-center">
                <p className="text-3xl font-bold text-brand-600">{parties.length}</p>
                <p className="text-sm text-slate-500 mt-1">Parties</p>
              </div>
              <div className="card p-5 text-center">
                <p className="text-3xl font-bold text-brand-600">{insurerPeriods.length}</p>
                <p className="text-sm text-slate-500 mt-1">Policy Periods</p>
              </div>
              <div className="card p-5 text-center">
                <p className="text-3xl font-bold text-brand-600">{invoices.length}</p>
                <p className="text-sm text-slate-500 mt-1">Invoices</p>
              </div>
              <div className="card p-5 text-center">
                <p className="text-3xl font-bold text-brand-600">
                  {formatCurrency(invoices.reduce((s, i) => s + (i.total_amount || 0), 0))}
                </p>
                <p className="text-sm text-slate-500 mt-1">Total Invoiced</p>
              </div>
            </div>

            {/* ── Default Apportionment Method ── */}
            <div className="card p-5">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-brand-500" />
                    Default Apportionment Method
                  </h3>
                  <p className="text-sm text-slate-400 mt-0.5">
                    New invoices added to this matter will be automatically apportioned using this method. Invoices can still be re-run with a different method individually.
                  </p>
                </div>
                {matter.default_apportionment_method && (
                  <button
                    onClick={() => setDefaultMethod(null)}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 ml-4"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                {APPORTIONMENT_METHODS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setDefaultMethod(m.value)}
                    className={`text-left rounded-xl border-2 p-4 transition-all ${
                      matter.default_apportionment_method === m.value
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className={`font-semibold text-sm ${matter.default_apportionment_method === m.value ? 'text-brand-700' : 'text-slate-800'}`}>
                      {m.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>
                  </button>
                ))}
              </div>
              {!matter.default_apportionment_method && (
                <p className="text-xs text-amber-600 mt-3 bg-amber-50 rounded-lg px-3 py-2">
                  No default set — invoices will need to be apportioned manually from each invoice's detail page.
                </p>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Financials Tab ── */}
      {tab === 'financials' && (() => {
        // Aggregate all insurer rows across all apportionments
        const allIA = financialRows.flatMap(appt =>
          appt.party_apportionments.flatMap(pa =>
            (pa.insurer_apportionments || []).map(ia => ({
              ...ia,
              party_name:     pa.parties?.name,
              invoice_number: appt.invoices?.invoice_number,
              invoice_date:   appt.invoices?.invoice_date,
              apportionment_id: appt.id,
            }))
          )
        )

        // Totals
        const totalInvoiced    = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
        const totalApportioned = allIA.reduce((s, ia) => s + (ia.amount || 0), 0)
        const totalPaid        = allIA.reduce((s, ia) => s + (ia.amount_paid || 0), 0)
        const totalDemanded    = allIA.filter(ia => ['demanded','paid','partially_paid','disputed'].includes(ia.payment_status))
                                      .reduce((s, ia) => s + (ia.amount || 0), 0)
        const totalOutstanding = totalApportioned - totalPaid

        // By insurer
        const byInsurer = {}
        allIA.forEach(ia => {
          const key = ia.insurers?.id
          if (!key) return
          if (!byInsurer[key]) byInsurer[key] = {
            name: ia.insurers?.name, policy_number: ia.insurers?.policy_number,
            owed: 0, paid: 0, invoices: new Set()
          }
          byInsurer[key].owed    += ia.amount || 0
          byInsurer[key].paid    += ia.amount_paid || 0
          byInsurer[key].invoices.add(ia.invoice_number)
        })

        // By party
        const byParty = {}
        financialRows.forEach(appt =>
          appt.party_apportionments.forEach(pa => {
            const key = pa.parties?.name
            if (!key) return
            if (!byParty[key]) byParty[key] = { owed: 0, paid: 0 }
            byParty[key].owed += pa.amount || 0
            byParty[key].paid += (pa.insurer_apportionments || []).reduce((s, ia) => s + (ia.amount_paid || 0), 0)
          })
        )

        // Augment byInsurer with policy limits (sum across all their policy periods for this matter)
        insurerPeriods.forEach(pp => {
          const key = pp.insurer_id
          if (!byInsurer[key] || !pp.policy_limit) return
          byInsurer[key].policy_limit = (byInsurer[key].policy_limit || 0) + Number(pp.policy_limit)
        })

        // Insurers at or above 70% exhaustion, sorted by worst first
        const exhaustionWarnings = Object.values(byInsurer)
          .filter(ins => ins.policy_limit && (ins.owed / ins.policy_limit) >= 0.7)
          .map(ins => ({ ...ins, pct: (ins.owed / ins.policy_limit) * 100 }))
          .sort((a, b) => b.pct - a.pct)

        return (
          <div className="space-y-6">
            {/* Policy limit exhaustion warnings */}
            {exhaustionWarnings.length > 0 && (
              <div className="space-y-2">
                {exhaustionWarnings.map((ins, i) => {
                  const info = exhaustionInfo(ins.pct)
                  const overLimit = ins.owed > ins.policy_limit
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      ins.pct >= 100 ? 'bg-red-50 border-red-200' :
                      ins.pct >= 90  ? 'bg-orange-50 border-orange-200' :
                                       'bg-amber-50 border-amber-200'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${info.color}`} />
                        <span className={`text-sm font-semibold ${info.color}`}>{ins.name}</span>
                        <span className="text-sm text-slate-600 truncate">
                          {formatCurrency(ins.owed)} of {formatCurrency(ins.policy_limit)} limit used
                          {overLimit
                            ? ` — over by ${formatCurrency(ins.owed - ins.policy_limit)}`
                            : ` — ${formatCurrency(ins.policy_limit - ins.owed)} remaining`}
                        </span>
                      </div>
                      <span className={`badge ${info.badge} text-xs whitespace-nowrap ml-3`}>
                        {ins.pct.toFixed(0)}% — {info.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Invoiced</p>
                <p className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">{formatCurrency(totalInvoiced)}</p>
                <p className="text-xs text-slate-400 mt-1">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Apportioned</p>
                <p className="text-2xl font-bold text-brand-700 mt-1">{formatCurrency(totalApportioned)}</p>
                <p className="text-xs text-slate-400 mt-1">{apportionments.length} apportionment{apportionments.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Paid</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(totalPaid)}</p>
                {totalApportioned > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{((totalPaid / totalApportioned) * 100).toFixed(0)}% collected</p>
                )}
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Outstanding</p>
                <p className={`text-2xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatCurrency(totalOutstanding)}
                </p>
                {totalOutstanding > 0 && totalApportioned > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{((totalOutstanding / totalApportioned) * 100).toFixed(0)}% remaining</p>
                )}
              </div>
            </div>

            {/* By insurer */}
            <div className="card overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">By Insurer</h2>
                <p className="text-xs text-slate-400 mt-0.5">Cumulative across all apportionments</p>
              </div>
              {Object.keys(byInsurer).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No apportionments run yet.</div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Insurer</th>
                      <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Policy #</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total Owed</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Paid</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Outstanding</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Policy Limit</th>
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Exhaustion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(byInsurer).sort((a,b) => b.owed - a.owed).map((ins, i) => {
                      const outstanding = ins.owed - ins.paid
                      const pct = ins.owed > 0 ? (ins.paid / ins.owed) * 100 : 0
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-4 font-medium text-slate-800">{ins.name}</td>
                          <td className="hidden sm:table-cell px-4 py-4 text-sm font-mono text-slate-500">{ins.policy_number || '—'}</td>
                          <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-slate-800">{formatCurrency(ins.owed)}</td>
                          <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-green-700">{formatCurrency(ins.paid)}</td>
                          <td className="px-4 py-4 text-right">
                            <span className={`font-semibold ${outstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {formatCurrency(outstanding)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-slate-600">
                            {ins.policy_limit ? formatCurrency(ins.policy_limit) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-4">
                            {ins.policy_limit ? (() => {
                              const xPct = (ins.owed / ins.policy_limit) * 100
                              const info = exhaustionInfo(xPct)
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-1.5">
                                    <div className={`${info.barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(xPct, 100)}%` }} />
                                  </div>
                                  <span className={`text-xs font-medium ${info.color}`}>{xPct.toFixed(0)}%</span>
                                  {xPct >= 70 && <span className={`badge ${info.badge} text-xs`}>{info.label}</span>}
                                </div>
                              )
                            })() : <span className="text-xs text-slate-300">No limit set</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={2} className="px-5 py-3 font-bold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900">{formatCurrency(totalApportioned)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-green-700">{formatCurrency(totalPaid)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-amber-600">{formatCurrency(totalOutstanding)}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                </table>
                </div>
              )}
            </div>

            {/* By party */}
            {Object.keys(byParty).length > 0 && (
              <div className="card overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">By Party</h2>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Party</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total Owed</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer Paid</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(byParty).sort((a,b) => b[1].owed - a[1].owed).map(([name, p]) => (
                      <tr key={name} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-800">{name}</td>
                        <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-slate-800">{formatCurrency(p.owed)}</td>
                        <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-green-700">{formatCurrency(p.paid)}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold ${p.owed - p.paid > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {formatCurrency(p.owed - p.paid)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Invoice-level detail */}
            {financialRows.length > 0 && (
              <div className="card overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Invoice Detail</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Payment status per insurer per invoice</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Invoice</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Party</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Insurer</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Owed</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Paid</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Payment Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allIA.map((ia, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-sm font-medium text-slate-800">
                            <Link to={`/matters/${matterId}/apportionments/${ia.apportionment_id}`}
                              className="hover:text-brand-600 transition-colors">
                              {ia.invoice_number || 'Invoice'}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{ia.party_name}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{ia.insurers?.name}</td>
                          <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-slate-800">{formatCurrency(ia.amount)}</td>
                          <td className="px-4 py-3 text-right text-green-700 font-semibold">
                            {ia.amount_paid > 0 ? formatCurrency(ia.amount_paid) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge ${PAYMENT_STATUS_COLORS[ia.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                              {PAYMENT_STATUS_LABELS[ia.payment_status] || ia.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {ia.payment_date ? format(parseISO(ia.payment_date), 'MM/dd/yyyy') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Parties Tab ── */}
      {tab === 'parties' && (() => {
        const remaining = parseFloat((100 - totalPartyPct).toFixed(4))
        const isOver    = totalPartyPct > 100
        const isUnder   = totalPartyPct < 100
        const isExact   = totalPartyPct === 100

        const toggleParty = (partyId) => setExpandedParties(prev => {
          const next = new Set(prev)
          next.has(partyId) ? next.delete(partyId) : next.add(partyId)
          return next
        })

        return (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Parties & Insurers</h2>
              <p className="text-xs text-slate-400 mt-0.5">Click a party row to expand its insurers. Click any percentage to edit inline.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isUnder && parties.length > 0 && (
                <button onClick={splitRemaining} className="btn-secondary text-sm text-amber-700 border-amber-300 hover:bg-amber-50">
                  <Plus className="h-4 w-4" /> Split {remaining}% remaining
                </button>
              )}
              {parties.length > 1 && (
                <button onClick={equalizeShares} className="btn-secondary text-sm">
                  <Check className="h-4 w-4" /> Equalize
                </button>
              )}
              <button onClick={() => setShowAddParty(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Party
              </button>
            </div>
          </div>

          {/* Total alert */}
          {parties.length > 0 && !isExact && (
            <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              isOver ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {isOver
                ? `Shares total ${totalPartyPct}% — over 100% by ${Math.abs(remaining)}%. Reduce one or more parties.`
                : `Shares total ${totalPartyPct}% — ${remaining}% unassigned. Apportionment won't reach 100% until this is resolved.`}
            </div>
          )}

          <div className="card overflow-hidden">
            {parties.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-3 text-slate-300" />
                <p className="font-medium text-slate-600 mb-1">No parties added yet</p>
                <p className="text-sm text-slate-400 mb-5 max-w-sm mx-auto">Add parties manually, or request coverage information directly from adjusters — they'll receive an email asking for carrier name, policy limits, coverage period, and dates of service.</p>
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <button onClick={() => setShowAddParty(true)} className="btn-primary">
                    <Plus className="h-4 w-4" /> Add Party
                  </button>
                  <button onClick={() => setShowAdjusterModal(true)} className="btn-secondary">
                    <Mail className="h-4 w-4" /> Request Info from Relevant Parties
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="w-9" />
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Name</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Share %</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Insurers</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {parties.map(p => {
                    const isExpanded    = expandedParties.has(p.id)
                    const partyInsurers = insurerPeriods.filter(pp => pp.party_id === p.id)

                    return (
                      <React.Fragment key={p.id}>
                        {/* ── Party row ── */}
                        <tr
                          className="hover:bg-slate-50 border-b border-slate-100 cursor-pointer select-none"
                          onClick={() => toggleParty(p.id)}
                        >
                          <td className="pl-3 py-4 text-slate-400">
                            <ChevronRight className={`h-4 w-4 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-medium text-slate-800">{p.name}</p>
                            {(p.responsible_start || p.responsible_end) && (
                              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                {p.responsible_start ? format(parseISO(p.responsible_start), 'MM/dd/yyyy') : '…'}
                                {' – '}
                                {p.responsible_end ? format(parseISO(p.responsible_end), 'MM/dd/yyyy') : '…'}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                            {editingPct[p.id] !== undefined ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number" step="0.01" min="0" max="100"
                                  value={editingPct[p.id]}
                                  onChange={e => setEditingPct(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  onBlur={() => savePct(p.id, editingPct[p.id])}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.target.blur() }
                                    if (e.key === 'Escape') { setEditingPct(prev => { const n={...prev}; delete n[p.id]; return n }) }
                                  }}
                                  className="w-24 text-right form-input py-1 px-2 text-sm font-semibold"
                                  autoFocus
                                />
                                <span className="text-xs text-slate-400">%</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-semibold text-slate-800">{p.share_percentage}%</span>
                                <button
                                  onClick={() => setEditingPct(prev => ({ ...prev, [p.id]: String(p.share_percentage) }))}
                                  className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded p-1 transition-colors"
                                  title="Edit percentage"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500">
                            {partyInsurers.length > 0 ? (
                              <span className="flex items-center gap-1.5">
                                <Shield className="h-3.5 w-3.5 text-slate-400" />
                                {partyInsurers.length} insurer{partyInsurers.length !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">none</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-400 max-w-xs truncate">{p.notes || '—'}</td>
                          <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-2">
                              <button onClick={() => setEditingParty(p)} className="text-slate-300 hover:text-brand-600 transition-colors" title="Edit party">
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button onClick={() => deleteParty(p.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Remove party">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* ── Expanded insurer sub-section ── */}
                        {isExpanded && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={6} className="px-0 py-0 bg-slate-50/60">
                              <div className="pl-12 pr-5 py-4">
                                {partyInsurers.length === 0 ? (
                                  <p className="text-sm text-slate-400 mb-3 flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-slate-300" />
                                    No insurers assigned to {p.name} yet.
                                  </p>
                                ) : (
                                  <table className="w-full text-sm mb-3">
                                    <thead>
                                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-200">
                                        <th className="text-left pb-2 pr-4 font-semibold">Insurer</th>
                                        <th className="text-left pb-2 pr-4 font-semibold">Policy #</th>
                                        <th className="text-left pb-2 pr-4 font-semibold">Claim #</th>
                                        <th className="text-left pb-2 pr-4 font-semibold">Claims Rep</th>
                                        <th className="text-left pb-2 pr-4 font-semibold">Period</th>
                                        <th className="text-right pb-2 pr-4 font-semibold">Limit</th>
                                        <th className="text-left pb-2 font-semibold">Exhaustion</th>
                                        <th className="w-16" />
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {partyInsurers.map(pp => {
                                        const obligated = obligatedByPeriodId[pp.id] || 0
                                        const xPct      = pp.policy_limit && obligated > 0 ? (obligated / Number(pp.policy_limit)) * 100 : null
                                        const info      = xPct !== null ? exhaustionInfo(xPct) : null
                                        const isExhausted = xPct !== null && xPct >= 100
                                        return (
                                          <tr key={pp.id} className={`group ${isExhausted ? 'bg-red-50/40' : 'hover:bg-white'}`}>
                                            <td className="py-2.5 pr-4 font-medium text-slate-800">{pp.insurers?.name}</td>
                                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{pp.insurers?.policy_number || '—'}</td>
                                            <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">{pp.claim_number || '—'}</td>
                                            <td className="py-2.5 pr-4">
                                              {pp.claims_rep_name || pp.claims_rep_email || pp.portal_url ? (
                                                <div>
                                                  <p className="text-xs font-medium text-slate-700">{pp.claims_rep_name}</p>
                                                  {pp.claims_rep_email && (
                                                    <a href={`mailto:${pp.claims_rep_email}`} className="text-xs text-brand-600 hover:underline">
                                                      {pp.claims_rep_email}
                                                    </a>
                                                  )}
                                                </div>
                                              ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            <td className="py-2.5 pr-4 text-xs text-slate-500 whitespace-nowrap">
                                              {pp.policy_start ? format(parseISO(pp.policy_start), 'MM/dd/yy') : '—'} – {pp.policy_end ? format(parseISO(pp.policy_end), 'MM/dd/yy') : '—'}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right text-xs text-slate-600 whitespace-nowrap">
                                              {pp.policy_limit ? formatCurrency(pp.policy_limit) : '—'}
                                            </td>
                                            <td className="py-2.5">
                                              {xPct !== null ? (
                                                <div className="flex items-center gap-2">
                                                  <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                                    <div className={`${info.barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(xPct, 100)}%` }} />
                                                  </div>
                                                  <span className={`text-xs font-bold ${info.color}`}>{xPct.toFixed(1)}%</span>
                                                </div>
                                              ) : <span className="text-xs text-slate-300">—</span>}
                                            </td>
                                            <td className="py-2.5 pl-2">
                                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                  onClick={() => setEditingInsurer(pp)}
                                                  className="text-slate-300 hover:text-brand-600 p-1 rounded transition-colors"
                                                  title="Edit policy period"
                                                >
                                                  <Edit2 className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => deleteInsurer(pp.id)}
                                                  className="text-slate-300 hover:text-red-500 p-1 rounded transition-colors"
                                                  title="Remove insurer"
                                                >
                                                  <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                )}
                                <button
                                  onClick={() => setAddInsurerForParty(p)}
                                  className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add Insurer to {p.name}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-slate-700">Total</td>
                    <td className={`px-4 py-3 text-right font-bold text-sm ${
                      isExact ? 'text-green-600' : isOver ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {totalPartyPct}%
                      {isExact && <span className="ml-1.5 text-xs font-normal text-green-500">✓</span>}
                      {isUnder && <span className="ml-1.5 text-xs font-normal text-amber-500">({remaining}% remaining)</span>}
                      {isOver  && <span className="ml-1.5 text-xs font-normal text-red-500">(over by {Math.abs(remaining)}%)</span>}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
        )
      })()}

      {/* ── Insurers Tab ── */}
      {tab === 'insurers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Insurers & Policy Periods</h2>
            <div className="flex gap-2">
              {insurerPeriods.some(pp => pp.policy_limit) && (
                <button
                  onClick={checkLimitsNow}
                  disabled={checkingLimits}
                  className="btn-secondary"
                  title="Check all policy limits and send alerts for new threshold crossings"
                >
                  {checkingLimits
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
                    : <><Bell className="h-4 w-4" /> Check Limits</>}
                </button>
              )}
              <button onClick={() => setShowAddInsurer(true)} className="btn-primary" disabled={parties.length === 0}>
                <Plus className="h-4 w-4" /> Add Insurer
              </button>
            </div>
          </div>

          <PolicyTimeline insurerPeriods={insurerPeriods} invoices={invoices} parties={parties} />
          {parties.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-amber-700 text-sm">
              Add parties first before adding insurers.
            </div>
          )}
          <div className="card overflow-hidden">
            {insurerPeriods.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Shield className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No insurers added yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Insurer</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Policy #</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Claim #</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Claims Rep</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Party</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Policy Period</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Limit</th>
                    <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Exhaustion</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {insurerPeriods.map(pp => {
                    const obligated   = obligatedByPeriodId[pp.id] || 0
                    const xPct        = pp.policy_limit && obligated > 0 ? (obligated / Number(pp.policy_limit)) * 100 : null
                    const info        = xPct !== null ? exhaustionInfo(xPct) : null
                    const alerted     = alertedThresholds[pp.id] || new Set()
                    const isExhausted = xPct !== null && xPct >= 100
                    const ppOverbroad = isOverbroad(
                      pp.responsible_start || '', pp.responsible_end || '',
                      pp.parties?.responsible_start || '', pp.parties?.responsible_end || ''
                    ) && !pp.date_range_override
                    return (
                    <tr key={pp.id} className={`hover:bg-slate-50 ${isExhausted ? 'bg-red-50/40' : ''}`}>
                      <td className="px-5 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          {pp.insurers?.name}
                          {ppOverbroad && (
                            <span title="Insurer dates of service are broader than the party's responsible period">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-mono text-slate-500">{pp.insurers?.policy_number || '—'}</td>
                      <td className="px-4 py-4 text-sm font-mono text-slate-600">{pp.claim_number || '—'}</td>
                      <td className="px-4 py-4">
                        {pp.claims_rep_name ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">{pp.claims_rep_name}</p>
                            {pp.claims_rep_email && (
                              <a href={`mailto:${pp.claims_rep_email}`}
                                className="text-xs text-brand-600 hover:underline">
                                {pp.claims_rep_email}
                              </a>
                            )}
                          </div>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{pp.parties?.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {pp.policy_start ? format(parseISO(pp.policy_start), 'MM/dd/yyyy') : '—'}
                        {' — '}
                        {pp.policy_end
                          ? format(parseISO(pp.policy_end), 'MM/dd/yyyy')
                          : <span className="text-emerald-600 font-medium">Present</span>
                        }
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-slate-600">
                        {pp.policy_limit ? formatCurrency(pp.policy_limit) : '—'}
                      </td>
                      <td className="px-4 py-4">
                        {xPct !== null ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-100 rounded-full h-2">
                                <div className={`${info.barColor} h-2 rounded-full`} style={{ width: `${Math.min(xPct, 100)}%` }} />
                              </div>
                              <span className={`text-xs font-bold ${info.color}`}>{xPct.toFixed(1)}%</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {xPct >= 70 && (
                                <span className={`badge ${info.badge} text-xs`}>
                                  <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                                  {info.label}
                                </span>
                              )}
                              {alerted.has(80) && (
                                <span className="badge bg-amber-100 text-amber-700 text-xs" title="80% alert sent">
                                  ⚠️ 80% alerted
                                </span>
                              )}
                              {alerted.has(95) && (
                                <span className="badge bg-orange-100 text-orange-700 text-xs" title="95% alert sent">
                                  🚨 95% alerted
                                </span>
                              )}
                              {alerted.has(100) && (
                                <span className="badge bg-red-100 text-red-700 text-xs" title="Exhaustion alert sent">
                                  🔴 Exhausted
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(obligated)} obligated
                            </p>
                          </div>
                        ) : <span className="text-xs text-slate-300">No limit set</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingInsurer(pp)}
                            className="text-slate-300 hover:text-brand-600 transition-colors" title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteInsurer(pp.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Invoices Tab ── */}
      {tab === 'invoices' && (() => {
        const unapportioned = invoices.filter(inv => inv.status !== 'apportioned')
        const apportioned   = invoices.filter(inv => inv.status === 'apportioned')

        const InvoiceTable = ({ rows, showStatus = false }) => (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Invoice #</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Billing Firm</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Date</th>
                <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Amount</th>
                {showStatus && <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/matters/${matterId}/invoices/${inv.id}`)}>
                  <td className="px-5 py-4 font-medium text-slate-800">{inv.invoice_number || 'Draft'}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">{inv.billing_firm || '—'}</td>
                  <td className="px-4 py-4 text-sm text-slate-600">
                    {inv.invoice_date ? format(parseISO(inv.invoice_date), 'MM/dd/yyyy') : '—'}
                  </td>
                  <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-slate-800">{formatCurrency(inv.total_amount)}</td>
                  {showStatus && (
                    <td className="px-4 py-4">
                      <span className={`badge ${statusColors[inv.status] || 'bg-slate-100 text-slate-500'}`}>{inv.status}</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )

        return (
          <div className="space-y-6">
            {/* ── Drag-to-upload zone ── */}
            <div
              onDragOver={e  => { e.preventDefault(); setInvoiceDragOver(true)  }}
              onDragLeave={() => setInvoiceDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setInvoiceDragOver(false)
                const files = Array.from(e.dataTransfer.files).filter(f =>
                  f.type === 'application/pdf' || f.type.startsWith('image/')
                )
                if (!files.length) return
                setInvoiceDropFiles(files)
                setShowUploadInvoice(true)
              }}
              className={`rounded-2xl border-2 border-dashed transition-all px-6 py-8 text-center cursor-pointer
                ${invoiceDragOver
                  ? 'border-brand-500 bg-brand-50 scale-[1.01]'
                  : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'
                }`}
              onClick={() => setShowUploadInvoice(true)}
            >
              <Upload className={`h-7 w-7 mx-auto mb-2 transition-colors ${invoiceDragOver ? 'text-brand-500' : 'text-slate-300'}`} />
              <p className={`text-sm font-medium transition-colors ${invoiceDragOver ? 'text-brand-700' : 'text-slate-500'}`}>
                {invoiceDragOver ? 'Drop to upload' : 'Drop an invoice here, or click to browse'}
              </p>
              <p className="text-xs text-slate-400 mt-1">PDF or image · up to 20 MB</p>
            </div>

            {/* ── Unapportioned ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-900">Unapportioned</h2>
                  {unapportioned.length > 0 && (
                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{unapportioned.length}</span>
                  )}
                </div>
                <button onClick={() => setShowUploadInvoice(true)} className="btn-primary">
                  <Upload className="h-4 w-4" /> Upload Invoice
                </button>
              </div>
              <div className="card overflow-hidden">
                {unapportioned.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>{invoices.length === 0 ? 'No invoices uploaded yet.' : 'All invoices have been apportioned.'}</p>
                    {invoices.length === 0 && (
                      <button onClick={() => setShowUploadInvoice(true)} className="btn-primary mt-4">
                        <Upload className="h-4 w-4" /> Upload First Invoice
                      </button>
                    )}
                  </div>
                ) : (
                  <InvoiceTable rows={unapportioned} showStatus={unapportioned.some(i => i.status === 'draft')} />
                )}
              </div>
            </div>

            {/* ── Apportioned ── */}
            {apportioned.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-semibold text-slate-900">Apportioned</h2>
                  <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{apportioned.length}</span>
                </div>
                <div className="card overflow-hidden">
                  <InvoiceTable rows={apportioned} showStatus={false} />
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Apportionments Tab ── */}
      {tab === 'apportionments' && (() => {
        const deleteApportionment = async (e, a) => {
          e.stopPropagation()
          if (!confirm(`Delete the apportionment for ${a.invoices?.invoice_number || 'this invoice'}? This cannot be undone.`)) return
          const { error } = await supabase.from('la_apportionments').delete().eq('id', a.id)
          if (error) { toast.error('Failed to delete apportionment'); return }
          qc.invalidateQueries({ queryKey: ['matter-apportionments', matterId] })
          toast.success('Apportionment deleted')
        }

        // ── Aggregate dashboard data from financialRows ──────────────────────
        const DASH_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488']
        const byParty   = {}   // partyName → { amount, paid }
        const byInsurer = {}   // `${party}::${insurer}` → { partyName, insurerName, amount, paid, statuses:{} }

        financialRows.forEach(appt => {
          ;(appt.party_apportionments || []).forEach(pa => {
            const pname = pa.parties?.name || 'Unknown'
            if (!byParty[pname]) byParty[pname] = { amount: 0, paid: 0 }
            byParty[pname].amount += Number(pa.amount) || 0
            ;(pa.insurer_apportionments || []).forEach(ia => {
              const iname = ia.insurers?.name || 'Unknown'
              const key   = `${pname}::${iname}`
              if (!byInsurer[key]) byInsurer[key] = { partyName: pname, insurerName: iname, amount: 0, paid: 0, statuses: {} }
              byInsurer[key].amount += Number(ia.amount)      || 0
              byInsurer[key].paid   += Number(ia.amount_paid) || 0
              byParty[pname].paid   += Number(ia.amount_paid) || 0
              const s = ia.payment_status || 'pending'
              byInsurer[key].statuses[s] = (byInsurer[key].statuses[s] || 0) + 1
            })
          })
        })

        const totalBilled   = financialRows.reduce((s, a) => s + (Number(a.invoices?.total_amount) || 0), 0)
        const totalObligated = Object.values(byParty).reduce((s, p) => s + p.amount, 0)
        const totalPaid      = Object.values(byParty).reduce((s, p) => s + p.paid,   0)
        const totalOut       = totalObligated - totalPaid
        const partyRows      = Object.entries(byParty).sort(([, a], [, b]) => b.amount - a.amount)
        const insurerRows    = Object.values(byInsurer).sort((a, b) => b.amount - a.amount)
        const hasDashData    = financialRows.length > 0 && partyRows.length > 0

        const statusLabel = { pending:'Pending', demanded:'Demanded', paid:'Paid', partially_paid:'Partial', disputed:'Disputed' }
        const statusColor = { pending:'bg-slate-100 text-slate-600', demanded:'bg-amber-100 text-amber-700', paid:'bg-green-100 text-green-700', partially_paid:'bg-blue-100 text-blue-700', disputed:'bg-red-100 text-red-700' }

        return (
          <div className="space-y-6">

            {/* ── Dashboard ── */}
            {hasDashData && (<>

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Billed',    value: formatCurrency(totalBilled),    sub: `${apportionments.length} apportionment${apportionments.length !== 1 ? 's' : ''}`, color: 'text-brand-700' },
                  { label: 'Total Obligated', value: formatCurrency(totalObligated), sub: 'across all invoices',  color: 'text-slate-900' },
                  { label: 'Total Paid',       value: formatCurrency(totalPaid),      sub: `${totalObligated > 0 ? ((totalPaid / totalObligated) * 100).toFixed(0) : 0}% collected`, color: 'text-green-700' },
                  { label: 'Outstanding',      value: formatCurrency(totalOut),       sub: totalOut > 0 ? 'unpaid obligations' : 'fully collected!', color: totalOut > 0 ? 'text-amber-600' : 'text-green-700' },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="card p-5">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                    <p className="text-xs text-slate-400 mt-1">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Party responsibilities chart */}
              <div className="card p-5">
                <h3 className="font-semibold text-slate-900 mb-1">Party Responsibilities</h3>
                <p className="text-xs text-slate-400 mb-5">Total obligation across all invoices — paid vs. outstanding</p>
                <div className="space-y-4">
                  {partyRows.map(([name, data], i) => {
                    const pct     = totalObligated > 0 ? (data.amount / totalObligated) * 100 : 0
                    const paidPct = data.amount > 0 ? Math.min((data.paid / data.amount) * 100, 100) : 0
                    const color   = DASH_COLORS[i % DASH_COLORS.length]
                    return (
                      <div key={name}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
                            <span className="text-sm font-semibold text-slate-800">{name}</span>
                            <span className="text-xs text-slate-400">{pct.toFixed(1)}% of total</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-slate-900">{formatCurrency(data.amount)}</span>
                            {data.paid > 0 && (
                              <span className="text-xs text-green-600 ml-2">{formatCurrency(data.paid)} paid</span>
                            )}
                          </div>
                        </div>
                        {/* Two-layer bar: obligation width (of total billed), paid fill inside */}
                        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                          <div className="h-3 rounded-full relative overflow-hidden" style={{ width: `${pct}%`, background: color + '33' }}>
                            <div className="h-3 rounded-full" style={{ width: `${paidPct}%`, background: color }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-brand-600" />Paid</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-brand-200" />Outstanding</div>
                </div>
              </div>

              {/* Insurer breakdown table */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900">Carrier Breakdown</h3>
                  <p className="text-xs text-slate-400 mt-0.5">All insurers across every apportionment on this matter</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Party</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Insurer</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Obligation</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Paid</th>
                        <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Outstanding</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {insurerRows.map((row, i) => {
                        const out = row.amount - row.paid
                        const dominantStatus = Object.entries(row.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] || 'pending'
                        const partyIdx = partyRows.findIndex(([n]) => n === row.partyName)
                        const dotColor = DASH_COLORS[partyIdx % DASH_COLORS.length]
                        return (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
                                <span className="text-sm text-slate-700">{row.partyName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-slate-800">{row.insurerName}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">{formatCurrency(row.amount)}</td>
                            <td className="px-4 py-3 text-right text-green-700 font-medium whitespace-nowrap">
                              {row.paid > 0 ? formatCurrency(row.paid) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {out > 0.01
                                ? <span className="font-semibold text-amber-600">{formatCurrency(out)}</span>
                                : <span className="text-green-600 text-sm">✓ Clear</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[dominantStatus] || 'bg-slate-100 text-slate-600'}`}>
                                {statusLabel[dominantStatus] || dominantStatus}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td colSpan={2} className="px-5 py-3 text-sm font-bold text-slate-700">Total</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(totalObligated)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(totalPaid)}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">{formatCurrency(totalOut)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>)}

            {/* ── Apportionment list ── */}
            <div>
              <h2 className="font-semibold text-slate-900 mb-4">Apportionments by Invoice</h2>
              <div className="card overflow-hidden">
                {apportionments.length === 0 ? (
                  <div className="p-10 text-center text-slate-400">
                    <Calculator className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p>No apportionments calculated yet.</p>
                    <p className="text-xs mt-1">Upload an invoice, then run an apportionment from the invoice detail page.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Invoice</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total</th>
                        <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Method</th>
                        <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Calculated</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {apportionments.map(a => (
                        <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/matters/${matterId}/apportionments/${a.id}`)}>
                          <td className="px-5 py-4 font-medium text-slate-800">{a.invoices?.invoice_number || 'Invoice'}</td>
                          <td className="px-4 py-4 text-right whitespace-nowrap font-semibold">{formatCurrency(a.invoices?.total_amount)}</td>
                          <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-500 capitalize">{a.calculation_method?.replace('_', ' ')}</td>
                          <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-400">
                            {a.calculated_at ? format(parseISO(a.calculated_at), 'MM/dd/yyyy HH:mm') : '—'}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <button
                              onClick={(e) => deleteApportionment(e, a)}
                              className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete apportionment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            </div>

          </div>
        )
      })()}

      {/* ── Settlement Tab ── */}
      {tab === 'settlement' && (
        <SettlementTab
          matter={matter}
          insurerPeriods={insurerPeriods}
          parties={parties}
        />
      )}

      {/* ── Documents Tab ── */}
      {tab === 'documents' && (() => {
        const docTypeMap = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]))

        const downloadDoc = async (doc) => {
          const { data, error } = await supabase.storage
            .from('la_documents')
            .createSignedUrl(doc.file_path, 3600)
          if (error) { toast.error('Could not generate download link'); return }
          window.open(data.signedUrl, '_blank')
        }

        const deleteDoc = async (doc) => {
          if (!confirm(`Delete "${doc.name}"?`)) return
          await supabase.storage.from('la_documents').remove([doc.file_path])
          await supabase.from('la_matter_documents').delete().eq('id', doc.id)
          logAudit({ profile, matterId, action: 'document.deleted', entityType: 'document', entityId: doc.id, entityName: doc.name, metadata: { doc_type: doc.doc_type } })
          refetchDocs()
          toast.success('Document deleted')
        }

        // Group by doc_type
        const grouped = {}
        documents.forEach(d => {
          const key = d.doc_type || 'other'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(d)
        })
        // Sort groups by DOC_TYPES order
        const orderedGroups = DOC_TYPES
          .filter(t => grouped[t.value])
          .map(t => ({ type: t, docs: grouped[t.value] }))

        return (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Documents</h2>
                <p className="text-xs text-slate-400 mt-0.5">Coverage opinions, ROR letters, settlement agreements, and more.</p>
              </div>
              <button onClick={() => setShowUploadDoc(true)} className="btn-primary">
                <Paperclip className="h-4 w-4" /> Attach Document
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="card p-12 text-center text-slate-400">
                <Paperclip className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No documents attached yet.</p>
                <p className="text-sm mt-1 mb-4">Attach coverage opinions, ROR letters, settlement agreements, and other key documents.</p>
                <button onClick={() => setShowUploadDoc(true)} className="btn-primary">
                  <Paperclip className="h-4 w-4" /> Attach First Document
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {orderedGroups.map(({ type, docs }) => (
                  <div key={type.value} className="card overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                      <span className={`badge text-xs font-semibold ${type.color}`}>{type.label}</span>
                      <span className="text-xs text-slate-400">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        {docs.map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-50 group">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                                  <p className="text-xs text-slate-400">{doc.file_name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden sm:table-cell">
                              {doc.file_size ? `${(doc.file_size / 1048576).toFixed(1)} MB` : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                              {doc.uploader
                                ? `${doc.uploader.first_name || ''} ${doc.uploader.last_name || ''}`.trim() || 'Unknown'
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                              {format(new Date(doc.created_at), 'MM/dd/yyyy')}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-xs hidden xl:table-cell">
                              {doc.notes && <span className="truncate block">{doc.notes}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => downloadDoc(doc)}
                                  className="text-slate-400 hover:text-brand-600 transition-colors"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deleteDoc(doc)}
                                  className="text-slate-300 hover:text-red-500 transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Activity Tab ── */}
      {tab === 'notes' && (
        <div className="space-y-5">

          {/* Compose box */}
          <div className="card p-5">
            <div className="flex gap-2 mb-3">
              {[
                { value: 'note',     label: 'Note',     icon: MessageSquare, color: 'bg-brand-100 text-brand-700 border-brand-300' },
                { value: 'flag',     label: 'Flag',     icon: Flag,          color: 'bg-red-100 text-red-700 border-red-300' },
                { value: 'call_log', label: 'Call Log', icon: Phone,         color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                { value: 'issue',    label: 'Issue',    icon: AlertCircle,   color: 'bg-amber-100 text-amber-700 border-amber-300' },
              ].map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  onClick={() => setNoteType(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    noteType === value ? color + ' shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitNote() }}
              placeholder={
                noteType === 'flag'     ? 'Describe the issue to flag…' :
                noteType === 'call_log' ? 'Log the call — who you spoke with, what was discussed…' :
                noteType === 'issue'    ? 'Describe the issue…' :
                'Add a note — context, follow-ups, anything the team should know…'
              }
              rows={3}
              className="form-input resize-none w-full text-sm"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-slate-400">⌘ + Enter to post</span>
              <button
                onClick={submitNote}
                disabled={!noteContent.trim() || submittingNote}
                className="btn-primary py-1.5 px-4 text-sm flex items-center gap-2"
              >
                {submittingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Post
              </button>
            </div>
          </div>

          {/* Notes thread */}
          {matterNotes.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p>No notes yet.</p>
              <p className="text-xs mt-1">Post context, flag issues, or log calls — they'll stay attached to this matter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matterNotes.map(note => {
                const NOTE_STYLES = {
                  note:     { bar: 'bg-brand-500',   badge: 'bg-brand-100 text-brand-700',    icon: MessageSquare, label: 'Note' },
                  flag:     { bar: 'bg-red-500',      badge: 'bg-red-100 text-red-700',        icon: Flag,          label: 'Flag' },
                  call_log: { bar: 'bg-emerald-500',  badge: 'bg-emerald-100 text-emerald-700',icon: Phone,         label: 'Call Log' },
                  issue:    { bar: 'bg-amber-500',    badge: 'bg-amber-100 text-amber-700',    icon: AlertCircle,   label: 'Issue' },
                }
                const style = NOTE_STYLES[note.note_type] || NOTE_STYLES.note
                const NoteIcon = style.icon
                const isOwn = profile?.id === note.user_id
                const isAdmin = ['owner', 'admin'].includes(profile?.role)

                return (
                  <div
                    key={note.id}
                    className={`card overflow-hidden flex ${note.is_pinned ? 'ring-2 ring-brand-200' : ''}`}
                  >
                    {/* Color bar */}
                    <div className={`w-1 flex-shrink-0 ${style.bar}`} />
                    <div className="flex-1 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Type badge */}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
                            <NoteIcon className="h-3 w-3" />
                            {style.label}
                          </span>
                          {note.is_pinned && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-600">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => togglePinNote(note)}
                            className={`p-1 rounded transition-colors ${note.is_pinned ? 'text-brand-500 hover:text-brand-700' : 'text-slate-300 hover:text-slate-500'}`}
                            title={note.is_pinned ? 'Unpin' : 'Pin to top'}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          {(isOwn || isAdmin) && (
                            <button
                              onClick={() => { if (window.confirm('Delete this note?')) deleteNote(note.id) }}
                              className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors"
                              title="Delete note"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Content */}
                      <p className="mt-2 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>

                      {/* Footer */}
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                        <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold uppercase text-[10px]">
                          {(note.user_name || note.user_email || '?')[0]}
                        </div>
                        <span className="font-medium text-slate-600">{note.user_name || note.user_email}</span>
                        <span>·</span>
                        <span>{format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}</span>
                        {note.updated_at !== note.created_at && <span className="italic">(edited)</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Matter Activity</h2>
            <span className="text-xs text-slate-400">{auditLogs.length} events</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p>No activity recorded yet.</p>
              <p className="text-xs mt-1">Actions like adding parties, running apportionments, and updating payments will appear here.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {(() => {
                // Group by calendar date
                const groups = []
                let currentDay = null
                for (const log of auditLogs) {
                  const day = format(new Date(log.created_at), 'yyyy-MM-dd')
                  if (day !== currentDay) {
                    currentDay = day
                    groups.push({ day, logs: [] })
                  }
                  groups[groups.length - 1].logs.push(log)
                }

                const ICON_MAP = {
                  Briefcase: Briefcase, Users: Users, Shield: Shield,
                  FileText: FileText, Calculator: Calculator,
                  DollarSign: DollarSign, Mail: Mail, Paperclip: Paperclip,
                  Activity: Activity, Clock: Clock,
                }

                return groups.map(({ day, logs: dayLogs }) => (
                  <div key={day}>
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 sticky top-0">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {format(new Date(day), 'MMMM d, yyyy')}
                      </p>
                    </div>
                    <ul className="divide-y divide-slate-50">
                      {dayLogs.map(log => {
                        const meta = getActionMeta(log.action)
                        const IconComp = ICON_MAP[meta.icon] || Activity
                        const time = format(new Date(log.created_at), 'h:mm a')
                        return (
                          <li key={log.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                            {/* Action icon */}
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.color}`}>
                              <IconComp className="h-3.5 w-3.5" />
                            </div>
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <p className="text-sm font-medium text-slate-800">{meta.label}</p>
                                <span className="text-xs text-slate-400 flex-shrink-0">{time}</span>
                              </div>
                              {log.entity_name && (
                                <p className="text-xs text-slate-600 mt-0.5 truncate">
                                  <span className="font-medium">{log.entity_name}</span>
                                  {/* Show key metadata inline */}
                                  {log.action === 'party.percentage_changed' && log.metadata?.old_pct !== undefined && (
                                    <span className="text-slate-400 ml-1">
                                      {Number(log.metadata.old_pct).toFixed(2)}% → {Number(log.metadata.new_pct).toFixed(2)}%
                                    </span>
                                  )}
                                  {log.action === 'insurer.added' && log.metadata?.party && (
                                    <span className="text-slate-400 ml-1">on {log.metadata.party}</span>
                                  )}
                                  {log.action === 'payment.updated' && log.metadata?.new_status && (
                                    <span className="text-slate-400 ml-1">→ {log.metadata.new_status}</span>
                                  )}
                                  {log.action === 'apportionment.calculated' && log.metadata?.method && (
                                    <span className="text-slate-400 ml-1">({log.metadata.method?.replace(/_/g,' ')})</span>
                                  )}
                                </p>
                              )}
                              {/* Actor */}
                              {log.user_name && (
                                <p className="text-xs text-slate-400 mt-0.5">by {log.user_name}</p>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))
              })()}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showEditMatter  && <EditMatterModal matter={matter} onClose={() => setShowEditMatter(false)} />}
      {showAddParty    && <AddPartyModal   matterId={matterId} existingParties={parties} onClose={() => setShowAddParty(false)} />}
      {showAdjusterModal && matter && <RequestAdjusterInfoModal matter={matter} onClose={() => setShowAdjusterModal(false)} />}
      {editingParty    && <EditPartyModal  party={editingParty} matterId={matterId} allParties={parties} onClose={() => setEditingParty(null)} />}
      {(showAddInsurer || addInsurerForParty) && (
        <AddInsurerModal
          matterId={matterId}
          parties={parties}
          defaultPartyId={addInsurerForParty?.id || null}
          onClose={() => { setShowAddInsurer(false); setAddInsurerForParty(null) }}
        />
      )}
      {editingInsurer  && <EditInsurerModal pp={editingInsurer} matterId={matterId} onClose={() => setEditingInsurer(null)} />}
      {showUploadInvoice && (
        <InvoiceUploadModal
          matterId={matterId}
          initialFiles={invoiceDropFiles}
          onClose={() => { setShowUploadInvoice(false); setInvoiceDropFiles([]); qc.invalidateQueries({ queryKey: ['matter-invoices', matterId] }) }}
        />
      )}
      {showUploadDoc && (
        <DocumentUploadModal
          matterId={matterId}
          onClose={() => setShowUploadDoc(false)}
          onUploaded={() => { refetchDocs(); setShowUploadDoc(false) }}
        />
      )}
      {showUseTemplate && matter && (
        <UseTemplateModal
          template={{ ...matter, la_parties: [{ count: parties.length }] }}
          onClose={() => setShowUseTemplate(false)}
        />
      )}
    </div>
  )
}
