import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { formatCurrency } from '../lib/calculations.js'
import {
  DollarSign, FileText, TrendingUp, AlertCircle, CheckCircle,
  Clock, Shield, CreditCard, X, ChevronDown, ChevronRight,
  Calendar, Hash, AlertTriangle, Loader2, ChevronUp, Receipt,
  Upload, MessageSquare, Download, Paperclip,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api.js'
import jsPDF from 'jspdf'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  pending:        { label: 'Pending',      bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
  demanded:       { label: 'Demanded',     bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500'  },
  paid:           { label: 'Paid',         bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  partially_paid: { label: 'Partial Pay',  bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  disputed:       { label: 'Disputed',     bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
}

const DISPUTE_REASONS = [
  'Coverage dispute',
  'Calculation error',
  'Policy not in effect during service period',
  'Amount incorrect',
  'Duplicate billing',
  'Settlement already reached',
  'Policy limit exceeded',
  'Other',
]

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

// ── Expanded line items ───────────────────────────────────────────────────────
function ExpandedLineItems({ invoiceId, invoice }) {
  const { data: lineItems = [], isLoading } = useQuery({
    queryKey: ['line-items', invoiceId],
    enabled:  !!invoiceId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_invoice_line_items')
        .select('id, date_of_service, description, timekeeper, hours, rate, amount, category')
        .eq('invoice_id', invoiceId)
        .order('date_of_service', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  return (
    <div className="bg-slate-50 border-t border-slate-100 px-5 py-5">
      {/* Invoice meta strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 mb-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <Receipt className="h-3.5 w-3.5 text-brand-500" />
          {invoice?.invoice_number || 'Invoice'}
        </span>
        {invoice?.billing_firm && <span>Billing firm: <strong className="text-slate-700">{invoice.billing_firm}</strong></span>}
        {invoice?.invoice_date  && <span>Issued: <strong className="text-slate-700">{format(parseISO(invoice.invoice_date), 'MMM d, yyyy')}</strong></span>}
        {invoice?.total_amount  && <span>Invoice total: <strong className="text-slate-700">{formatCurrency(Number(invoice.total_amount))}</strong></span>}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading charges…
        </div>
      ) : lineItems.length === 0 ? (
        <p className="text-sm text-slate-400 py-2">No line items on file for this invoice.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Date', 'Description', 'Timekeeper', 'Category', 'Hours', 'Rate', 'Amount'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lineItems.map(li => (
                <tr key={li.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                    {li.date_of_service ? format(parseISO(li.date_of_service), 'MM/dd/yy') : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-800 max-w-xs">
                    <span className="line-clamp-2">{li.description || '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{li.timekeeper || '—'}</td>
                  <td className="px-4 py-2.5">
                    {li.category ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        li.category === 'fees' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                      }`}>{li.category}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">
                    {li.hours != null ? Number(li.hours).toFixed(2) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">
                    {li.rate != null ? formatCurrency(Number(li.rate)) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                    {formatCurrency(Number(li.amount || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50">
                <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Total ({lineItems.length} line item{lineItems.length !== 1 ? 's' : ''})
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                  {formatCurrency(lineItems.reduce((s, l) => s + Number(l.amount || 0), 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Dispute modal ─────────────────────────────────────────────────────────────
function DisputeModal({ obligation, onClose, onSuccess }) {
  const [reason, setReason]       = useState('')
  const [notes, setNotes]         = useState('')
  const [files, setFiles]         = useState([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef(null)

  const outstanding = (obligation.amount || 0) - (obligation.amount_paid || 0)

  const handleSubmit = async () => {
    if (!reason) { toast.error('Please select a dispute reason'); return }
    setSubmitting(true)
    try {
      // Upload supporting documents to Supabase Storage
      const fileRefs = []
      for (const file of files) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${obligation.id}/${Date.now()}-${safeName}`
        const { error: uploadError } = await supabase.storage
          .from('portal-disputes')
          .upload(path, file, { upsert: false })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('portal-disputes').getPublicUrl(path)
          fileRefs.push({ name: file.name, url: urlData.publicUrl })
        } else {
          console.warn('File upload skipped:', uploadError.message)
        }
      }

      const disputePayload = JSON.stringify({
        dispute_reason:   reason,
        dispute_notes:    notes,
        dispute_filed_at: new Date().toISOString(),
        dispute_files:    fileRefs,
      })

      const { error } = await supabase
        .from('la_insurer_apportionments')
        .update({ payment_status: 'disputed', payment_notes: disputePayload })
        .eq('id', obligation.id)

      if (error) throw error
      toast.success('Dispute filed successfully')
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to file dispute')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative">
        <button onClick={onClose} disabled={submitting} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">File a Dispute</h2>
            <p className="text-sm text-slate-500">
              {obligation.invoice?.invoice_number || 'Invoice'} · {formatCurrency(outstanding)} outstanding
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Reason */}
          <div>
            <label className="form-label">Dispute Reason <span className="text-red-500">*</span></label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="form-input">
              <option value="">Select a reason…</option>
              {DISPUTE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Additional Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe the basis for your dispute in detail…"
              className="form-input resize-none"
            />
          </div>

          {/* File upload */}
          <div>
            <label className="form-label">Supporting Documents</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            >
              <Upload className="h-6 w-6 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Click to attach files</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF, images, or documents</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => setFiles(Array.from(e.target.files || []))}
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-slate-400 text-xs ml-auto whitespace-nowrap">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 transition-colors ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason}
            className="btn-danger flex-1"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Filing…</>
              : 'File Dispute'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Partial payment modal ─────────────────────────────────────────────────────
function PartialPaymentModal({ obligation, onClose, onSuccess }) {
  const outstanding = (obligation.amount || 0) - (obligation.amount_paid || 0)
  const [amount, setAmount]       = useState('')
  const [payDate, setPayDate]     = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)

  const parsed    = parseFloat(amount) || 0
  const remaining = outstanding - parsed
  const isValid   = parsed > 0 && parsed <= outstanding

  const handleSubmit = async () => {
    if (!isValid) { toast.error('Enter a valid payment amount'); return }
    setSubmitting(true)
    try {
      const newPaid      = (obligation.amount_paid || 0) + parsed
      const fullyPaid    = newPaid >= (obligation.amount || 0)
      const noteText     = notes.trim() ||
        `Partial payment of ${formatCurrency(parsed)} recorded ${payDate}`

      const { error } = await supabase
        .from('la_insurer_apportionments')
        .update({
          amount_paid:    newPaid,
          payment_status: fullyPaid ? 'paid' : 'partially_paid',
          payment_date:   payDate,
          payment_notes:  noteText,
        })
        .eq('id', obligation.id)

      if (error) throw error
      toast.success(`Payment of ${formatCurrency(parsed)} recorded`)
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to record payment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        <button onClick={onClose} disabled={submitting} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Record Partial Payment</h2>
            <p className="text-sm text-slate-500">{obligation.invoice?.invoice_number || 'Invoice'}</p>
          </div>
        </div>

        {/* Balance strip */}
        <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Outstanding Balance</p>
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(outstanding)}</p>
            </div>
            {parsed > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">After This Payment</p>
                <p className={`text-2xl font-bold ${remaining <= 0 ? 'text-green-600' : 'text-slate-700'}`}>
                  {remaining <= 0 ? '✓ Paid in full' : formatCurrency(remaining)}
                </p>
              </div>
            )}
          </div>
          {parsed > 0 && remaining > 0 && (
            <div className="mt-3">
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-200"
                  style={{ width: `${Math.min(100, (parsed / outstanding) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1 text-right">
                {((parsed / outstanding) * 100).toFixed(0)}% of outstanding
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="form-label">Payment Amount <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
              <input
                type="number"
                min="0.01"
                max={outstanding}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="form-input pl-7"
              />
            </div>
            {parsed > outstanding && (
              <p className="text-xs text-red-500 mt-1">
                Cannot exceed outstanding balance of {formatCurrency(outstanding)}
              </p>
            )}
          </div>

          <div>
            <label className="form-label">Payment Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={payDate}
              onChange={e => setPayDate(e.target.value)}
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">Reference / Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Check number, wire reference, etc."
              className="form-input resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} disabled={submitting} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className="btn-primary flex-1"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</>
              : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Receipt PDF generator ─────────────────────────────────────────────────────
async function loadLogoBase64() {
  return new Promise(resolve => {
    fetch('/logo-icon.png')
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror   = () => resolve(null)
        reader.readAsDataURL(blob)
      })
      .catch(() => resolve(null))
  })
}

async function generatePortalReceipt(obligation, insurerName) {
  const logoDataUrl = await loadLogoBase64()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

  const W       = doc.internal.pageSize.getWidth()
  const receiptNum = `RCP-${obligation.id.toString().slice(-8).toUpperCase()}`
  const paidAmt = obligation.amount_paid || obligation.amount || 0
  const owed    = obligation.amount || 0
  const remaining = owed - paidAmt
  const isFullPaid = remaining <= 0

  // ── Header band ─────────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59) // slate-900
  doc.rect(0, 0, W, 28, 'F')

  // Logo
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 10, 5, 18, 18)
  } else {
    doc.setFillColor(79, 70, 229)
    doc.roundedRect(10, 5, 18, 18, 3, 3, 'F')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text('LA', 19, 16.5, { align: 'center' })
  }

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Payment Receipt', 34, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184) // slate-400
  doc.text('LexAlloc Legal Cost Management', 34, 18)

  // Receipt # top right
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(`Receipt #${receiptNum}`, W - 10, 12, { align: 'right' })
  doc.text(format(new Date(), 'MMMM d, yyyy'), W - 10, 18, { align: 'right' })

  // ── Status ribbon ────────────────────────────────────────────────────────────
  const ribbonColor = isFullPaid ? [22, 163, 74] : [37, 99, 235] // green-600 / blue-600
  doc.setFillColor(...ribbonColor)
  doc.rect(0, 28, W, 8, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(isFullPaid ? '✓  PAYMENT CONFIRMED — PAID IN FULL' : '◑  PARTIAL PAYMENT RECORDED', W / 2, 33.5, { align: 'center' })

  // ── Body ─────────────────────────────────────────────────────────────────────
  let y = 46
  const col1 = 14, col2 = W / 2 + 4

  const section = (title) => {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 116, 139) // slate-500
    doc.text(title.toUpperCase(), col1, y)
    doc.setDrawColor(226, 232, 240)
    doc.line(col1, y + 1.5, W - col1, y + 1.5)
    y += 7
  }

  const field = (label, value, x = col1, colWidth = W / 2 - 18) => {
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 116, 139)
    doc.text(label, x, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    const lines = doc.splitTextToSize(value || '—', colWidth)
    doc.text(lines, x, y + 5)
    return y + 5 + (lines.length - 1) * 5
  }

  // ── Parties ──────────────────────────────────────────────────────────────────
  section('Parties')
  const yAfterParties = Math.max(
    field('From (Insurer)', insurerName || 'Unknown Insurer', col1),
    field('Managed by', 'LexAlloc Legal Cost Management', col2)
  )
  y = yAfterParties + 8

  // ── Matter & Invoice ─────────────────────────────────────────────────────────
  section('Matter & Invoice')
  const yAfterMatter = Math.max(
    field('Matter', obligation.matter?.name || '—', col1),
    field('Matter #', obligation.matter?.matter_number || '—', col2)
  )
  y = yAfterMatter + 6

  const yAfterInvoice = Math.max(
    field('Invoice #', obligation.invoice?.invoice_number || '—', col1),
    field('Invoice Date', obligation.invoice?.invoice_date
      ? format(parseISO(obligation.invoice.invoice_date), 'MMMM d, yyyy')
      : '—', col2)
  )
  y = yAfterInvoice + 6

  if (obligation.policy_period?.claim_number || obligation.policy_period?.policy_start) {
    const yAfterPolicy = Math.max(
      field('Claim #', obligation.policy_period?.claim_number || '—', col1),
      field('Policy Period', obligation.policy_period?.policy_start && obligation.policy_period?.policy_end
        ? `${format(parseISO(obligation.policy_period.policy_start), 'MM/dd/yyyy')} – ${format(parseISO(obligation.policy_period.policy_end), 'MM/dd/yyyy')}`
        : '—', col2)
    )
    y = yAfterPolicy + 6
  }

  // ── Payment summary box ───────────────────────────────────────────────────────
  y += 4
  section('Payment Summary')

  // Summary table
  const rows = [
    ['Total Obligation', formatCurrency(owed)],
    ['Amount Paid', formatCurrency(paidAmt)],
  ]
  if (!isFullPaid) rows.push(['Remaining Balance', formatCurrency(remaining)])
  if (obligation.payment_date) rows.push(['Payment Date', format(parseISO(obligation.payment_date), 'MMMM d, yyyy')])

  const tableTop = y
  const rowH = 9
  rows.forEach(([label, val], i) => {
    const rowY = tableTop + i * rowH
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252)
      doc.rect(col1 - 2, rowY - 4, W - col1 * 2 + 4, rowH, 'F')
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(label, col1, rowY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    doc.text(val, W - col1, rowY, { align: 'right' })
  })

  y = tableTop + rows.length * rowH + 4

  // Total paid highlight box
  doc.setFillColor(...ribbonColor)
  doc.roundedRect(col1 - 2, y, W - col1 * 2 + 4, 12, 2, 2, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(isFullPaid ? 'Total Paid' : 'Amount Paid This Payment', col1 + 2, y + 8)
  doc.setFontSize(12)
  doc.text(formatCurrency(paidAmt), W - col1 - 2, y + 8, { align: 'right' })

  y += 20

  // Payment notes if present
  if (obligation.payment_notes && !obligation.payment_notes.startsWith('{')) {
    section('Payment Notes')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    const noteLines = doc.splitTextToSize(obligation.payment_notes, W - col1 * 2)
    doc.text(noteLines, col1, y)
    y += noteLines.length * 5 + 8
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(248, 250, 252)
  doc.rect(0, pageH - 18, W, 18, 'F')
  doc.setDrawColor(226, 232, 240)
  doc.line(0, pageH - 18, W, pageH - 18)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(148, 163, 184)
  doc.text(`Receipt #${receiptNum}  ·  Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`, W / 2, pageH - 10, { align: 'center' })
  doc.text('LexAlloc Legal Cost Management  ·  This document is a record of payment on file', W / 2, pageH - 5, { align: 'center' })

  const filename = `receipt-${receiptNum}-${(insurerName || 'insurer').replace(/\s+/g, '-')}.pdf`
  doc.save(filename)
}

// ── Matter card ───────────────────────────────────────────────────────────────
function MatterCard({ matter, rows, insurerName, onPay, payingId, onDispute, onPartialPay, onDownloadReceipt }) {
  const [expanded, setExpanded]           = useState(true)
  const [expandedRowId, setExpandedRowId] = useState(null)
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
              <tbody className="divide-y divide-slate-100">
                {rows.map(row => {
                  const outstanding = (row.amount || 0) - (row.amount_paid || 0)
                  const payable     = row.payment_status !== 'paid' && outstanding > 0
                  const isDisputed  = row.payment_status === 'disputed'
                  const hasReceipt  = row.payment_status === 'paid' || (row.payment_status === 'partially_paid' && (row.amount_paid || 0) > 0)
                  const isExpanded  = expandedRowId === row.id

                  return (
                    <>
                      <tr
                        key={row.id}
                        onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                        className={`cursor-pointer transition-colors select-none ${isExpanded ? 'bg-brand-50/60' : 'hover:bg-slate-50'} ${row.payment_status === 'paid' ? 'opacity-75' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            {isExpanded
                              ? <ChevronUp    className="h-3.5 w-3.5 text-brand-500 flex-shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />}
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{row.invoice?.invoice_number || '—'}</p>
                              {row.invoice?.invoice_date && (
                                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {format(parseISO(row.invoice.invoice_date), 'MMM d, yyyy')}
                                </p>
                              )}
                            </div>
                          </div>
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

                        {/* ── Action buttons ── */}
                        <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">

                            {/* Pay Now — for payable non-disputed rows */}
                            {payable && !isDisputed && (
                              <button
                                onClick={() => onPay(row)}
                                disabled={payingId === row.id}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shadow-sm"
                              >
                                {payingId === row.id
                                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</>
                                  : <><CreditCard className="h-3.5 w-3.5" /> Pay</>}
                              </button>
                            )}

                            {/* Partial Pay — for payable non-disputed rows */}
                            {payable && !isDisputed && (
                              <button
                                onClick={() => onPartialPay(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap border border-blue-200"
                              >
                                <DollarSign className="h-3.5 w-3.5" /> Partial
                              </button>
                            )}

                            {/* Dispute — for payable non-disputed rows */}
                            {payable && !isDisputed && (
                              <button
                                onClick={() => onDispute(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap border border-slate-200 hover:border-red-200"
                              >
                                <MessageSquare className="h-3.5 w-3.5" /> Dispute
                              </button>
                            )}

                            {/* Under review badge for disputed rows */}
                            {isDisputed && (
                              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium bg-red-50 px-2.5 py-1.5 rounded-lg border border-red-100">
                                <AlertCircle className="h-3.5 w-3.5" /> Under Review
                              </span>
                            )}

                            {/* Receipt download for paid / partially_paid */}
                            {hasReceipt && (
                              <button
                                onClick={() => onDownloadReceipt(row)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap border border-green-200"
                              >
                                <Download className="h-3.5 w-3.5" /> Receipt
                              </button>
                            )}

                            {/* Fully paid indicator (no actions) */}
                            {row.payment_status === 'paid' && !hasReceipt && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                <CheckCircle className="h-3.5 w-3.5" /> Paid
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.id}-expanded`}>
                          <td colSpan={8} className="p-0 border-b border-brand-100">
                            <ExpandedLineItems invoiceId={row.invoice?.id} invoice={row.invoice} />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-slate-700">Matter Total</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-slate-900 text-sm">{formatCurrency(mOwed)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-bold text-green-600 text-sm">{formatCurrency(mPaid)}</td>
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

        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="h-9 w-9 text-green-500" />
        </div>

        <h2 className="text-xl font-bold text-center text-slate-900 mb-1">Payment Successful</h2>
        <p className="text-center text-slate-500 text-sm mb-6">Your payment has been received. A confirmation email has been sent to you.</p>

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
  const [payingId,        setPayingId]        = useState(null)
  const [paymentBanner,   setPaymentBanner]   = useState(null)
  const [successSessionId,setSuccessSessionId]= useState(null)
  const [disputeTarget,   setDisputeTarget]   = useState(null)
  const [partialTarget,   setPartialTarget]   = useState(null)

  useEffect(() => {
    const params    = new URLSearchParams(window.location.search)
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
        .select(`id, matters:la_matters(id, name, matter_number), invoices:la_invoices(id, invoice_number, invoice_date, service_start, service_end, total_amount, billing_firm)`)
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

  const handleObligationRefresh = () => {
    qc.invalidateQueries({ queryKey: ['client-obligations'] })
  }

  const handleDownloadReceipt = async (obligation) => {
    try {
      await generatePortalReceipt(obligation, insurer?.name)
    } catch (err) {
      toast.error('Could not generate receipt')
      console.error(err)
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

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {successSessionId && (
        <PaymentSuccessModal
          obligation={successObligation}
          onClose={() => setSuccessSessionId(null)}
        />
      )}
      {disputeTarget && (
        <DisputeModal
          obligation={disputeTarget}
          onClose={() => setDisputeTarget(null)}
          onSuccess={handleObligationRefresh}
        />
      )}
      {partialTarget && (
        <PartialPaymentModal
          obligation={partialTarget}
          onClose={() => setPartialTarget(null)}
          onSuccess={handleObligationRefresh}
        />
      )}

      {/* ── Portal header ──────────────────────────────────────────────────────── */}
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
                onDispute={setDisputeTarget}
                onPartialPay={setPartialTarget}
                onDownloadReceipt={handleDownloadReceipt}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
