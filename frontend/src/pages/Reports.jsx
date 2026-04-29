import { useState, useMemo, Fragment } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { differenceInDays, parseISO, subDays, format } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  AlertTriangle, Clock, Layers, TrendingUp, BarChart3,
  Download, FileSpreadsheet, FileText, ChevronDown, ChevronRight, Scale, Mail, Timer,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, FolderOpen, ExternalLink,
} from 'lucide-react'
import { formatCurrency } from '../lib/calculations.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Brand / style constants ───────────────────────────────────────────────────
const BRAND  = [79,  70, 229]
const DARK   = [15,  23, 42]
const MID    = [71,  85, 105]
const LIGHT  = [241, 245, 249]
const WHITE  = [255, 255, 255]
const GREEN  = [22,  163, 74]
const RED    = [185, 28,  28]
const AMBER  = [180, 83,   9]

const CHART_COLORS = [
  '#4f46e5','#2563eb','#16a34a','#d97706',
  '#dc2626','#0891b2','#9333ea','#ea580c','#0d9488','#be185d',
]

const STATUS_COLORS = {
  pending:        'bg-amber-100 text-amber-700',
  demanded:       'bg-red-100 text-red-700',
  disputed:       'bg-orange-100 text-orange-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  paid:           'bg-green-100 text-green-700',
}

const DATE_PRESETS = [
  { label: 'Last 30 days',   days: 30     },
  { label: 'Last 90 days',   days: 90     },
  { label: 'Last 12 months', days: 365    },
  { label: 'All time',       days: null   },
  { label: 'Custom',         days: 'custom' },
]

const TABS = [
  { key: 'outstanding',    label: 'A/R',                     icon: AlertTriangle },
  { key: 'collections',    label: 'AR Aging',                icon: Timer         },
  { key: 'velocity',       label: 'Payment Velocity',        icon: Clock         },
  { key: 'categories',     label: 'Invoice Categories',      icon: Layers        },
  { key: 'aging',          label: 'Matter Aging',            icon: TrendingUp    },
  { key: 'settlements',    label: 'Settlements',             icon: Scale         },
  { key: 'demand_letters', label: 'Demand Letters',          icon: Mail          },
]

const AGING_BUCKETS = [
  { key: '0-30',  label: 'Current',   sublabel: '0–30 days',  color: '#16a34a', bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-100 text-green-700'  },
  { key: '31-60', label: '30–60',     sublabel: '31–60 days', color: '#d97706', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-700'  },
  { key: '61-90', label: '60–90',     sublabel: '61–90 days', color: '#ea580c', bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700'},
  { key: '90+',   label: '90+ Days',  sublabel: 'Overdue',    color: '#dc2626', bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    badge: 'bg-red-100 text-red-700'      },
]

function agingBucket(daysSinceDemand) {
  if (daysSinceDemand <= 30) return '0-30'
  if (daysSinceDemand <= 60) return '31-60'
  if (daysSinceDemand <= 90) return '61-90'
  return '90+'
}

const DELINQUENCY_BANDS = [
  { max: 30,  label: '0–30 days',   cls: 'bg-green-100 text-green-700'  },
  { max: 60,  label: '31–60 days',  cls: 'bg-amber-100 text-amber-700'  },
  { max: 90,  label: '61–90 days',  cls: 'bg-orange-100 text-orange-700' },
  { max: Infinity, label: '90+ days', cls: 'bg-red-100 text-red-700'    },
]

function delinquencyBand(days) {
  return DELINQUENCY_BANDS.find(b => days <= b.max) || DELINQUENCY_BANDS[DELINQUENCY_BANDS.length - 1]
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF export helper
// ═══════════════════════════════════════════════════════════════════════════════

// Module-level logo cache — fetched once per session
let _logoDataUrl = null
async function getLogoDataUrl() {
  if (_logoDataUrl) return _logoDataUrl
  try {
    const res  = await fetch('/logo-icon.png')
    const blob = await res.blob()
    _logoDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    _logoDataUrl = null
  }
  return _logoDataUrl
}

async function exportPDF({ title, dateLabel, kpis = [], columns, rows, filename }) {
  const logoDataUrl = await getLogoDataUrl()

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const W   = doc.internal.pageSize.getWidth()

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 22, 'F')

  // Logo image (circle icon) or fallback drawn mark
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 5, 4, 13, 13)
  } else {
    doc.setFillColor(...WHITE)
    doc.setDrawColor(...BRAND)
    doc.roundedRect(6, 5, 11, 11, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.setTextColor(...BRAND)
    doc.text('LA', 11.5, 12, { align: 'center' })
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('LexAlloc', 20, 13)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 205, 245)
  doc.text(`Reports & Analytics  ·  ${title}`, 46, 13)

  doc.setFontSize(7.5)
  doc.setTextColor(200, 205, 245)
  doc.text(
    `${dateLabel}  ·  Generated ${format(new Date(), 'MMMM d, yyyy')}`,
    W - 8, 13, { align: 'right' }
  )

  // ── KPI row ─────────────────────────────────────────────────────────────────
  let y = 28
  if (kpis.length > 0) {
    const boxW = (W - 16) / kpis.length
    kpis.forEach((kpi, i) => {
      const x = 8 + i * boxW
      doc.setFillColor(...LIGHT)
      doc.roundedRect(x, y, boxW - 3, 18, 2, 2, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6)
      doc.setTextColor(...MID)
      doc.text(kpi.label.toUpperCase(), x + 4, y + 6)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...DARK)
      doc.text(String(kpi.value), x + 4, y + 14)
    })
    y += 24
  }

  // ── Table ───────────────────────────────────────────────────────────────────
  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: y,
    styles: {
      fontSize:    8,
      cellPadding: 3,
      textColor:   DARK,
    },
    headStyles: {
      fillColor:  BRAND,
      textColor:  WHITE,
      fontStyle:  'bold',
      fontSize:   7.5,
    },
    alternateRowStyles: { fillColor: LIGHT },
    margin: { left: 8, right: 8 },
    tableLineColor: [226, 232, 240],
    tableLineWidth: 0.1,
  })

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...MID)
    doc.text(
      `LexAlloc  ·  ${title}  ·  Page ${p} of ${pageCount}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' }
    )
  }

  doc.save(filename)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Excel (.xlsx) export helper
// ═══════════════════════════════════════════════════════════════════════════════
function exportXLSX({ sheetName, headers, rows, colWidths, currencyCols = [], filename }) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Column widths
  ws['!cols'] = colWidths.map(w => ({ wch: w }))

  // Freeze first row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 }

  // Style header row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[ref]) continue
    ws[ref].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
      fill:      { patternType: 'solid', fgColor: { rgb: '4F46E5' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
      border: {
        bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      },
    }
  }

  // Format currency columns + alternate row shading
  for (let r = 1; r <= rows.length; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (!ws[ref]) continue
      const isAlt = r % 2 === 0
      const isCur = currencyCols.includes(c)
      ws[ref].s = {
        fill: isAlt ? { patternType: 'solid', fgColor: { rgb: 'F8FAFC' } } : {},
        numFmt: isCur ? '"$"#,##0.00' : undefined,
        alignment: { vertical: 'center' },
      }
      if (isCur && typeof ws[ref].v === 'number') {
        ws[ref].t = 'n'
        ws[ref].z = '"$"#,##0.00'
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', cellStyles: true })
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-slate-900' }) {
  // Reserve a fixed two-line label area so cards with longer labels don't
  // push their value down out of alignment with sibling cards in the same
  // grid row. text-xs * leading-tight ≈ 15px/line → 2rem fits two lines.
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide leading-tight min-h-[2rem] mb-1.5">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// Export dropdown menu (PDF + Excel)
function ExportMenu({ onPDF, onExcel }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 border border-slate-200 hover:border-brand-300 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-44 overflow-hidden">
            <button
              onClick={() => { onExcel(); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Excel (.xlsx)
            </button>
            <button
              onClick={() => { onPDF(); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              <FileText className="h-4 w-4 text-red-500" />
              PDF
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SectionHeader({ title, onPDF, onExcel }) {
  return (
    <div className="flex items-center justify-between p-5 border-b border-slate-100">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <ExportMenu onPDF={onPDF} onExcel={onExcel} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 1 — Outstanding Obligations by Insurer
// ═══════════════════════════════════════════════════════════════════════════════
function OutstandingReport({ data, dateLabel }) {
  const totals = useMemo(() => ({
    outstanding: data.reduce((s, r) => s + r.total - r.paid, 0),
    obligations: data.reduce((s, r) => s + r.count, 0),
    insurers:    data.length,
    demanded:    data.reduce((s, r) => s + r.demanded, 0),
  }), [data])

  const chartData = data.slice(0, 10).map(r => ({
    name:        r.name.replace('[DEMO] ', '').slice(0, 22),
    outstanding: parseFloat((r.total - r.paid).toFixed(2)),
  }))

  const headers   = ['Insurer / Carrier', 'Obligations', 'Total Obligated', 'Amount Paid', 'Outstanding', 'Demanded', 'Disputed', 'Pending']
  const tableRows = data.map(r => [
    r.name, r.count,
    r.total, r.paid,
    r.total - r.paid, r.demanded, r.disputed, r.pending,
  ])
  const kpis = [
    { label: 'Total Outstanding',  value: formatCurrency(totals.outstanding) },
    { label: 'Demanded',           value: formatCurrency(totals.demanded)    },
    { label: 'Active Obligations', value: totals.obligations                 },
    { label: 'Carriers Owing',     value: totals.insurers                    },
  ]

  const handlePDF = async () => exportPDF({
    title:     'Outstanding Obligations by Carrier',
    dateLabel,
    kpis,
    columns:   headers,
    rows:      tableRows.map(r => [r[0], r[1], ...r.slice(2).map(v => formatCurrency(v))]),
    filename:  `outstanding-obligations-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Outstanding Obligations',
    headers,
    rows:         tableRows,
    colWidths:    [32, 12, 16, 14, 14, 14, 12, 12],
    currencyCols: [2, 3, 4, 5, 6, 7],
    filename:     `outstanding-obligations-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (data.length === 0) return (
    <div className="card p-12 text-center text-slate-400">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p>No outstanding obligations found for {dateLabel}.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Outstanding"  value={formatCurrency(totals.outstanding)} color="text-red-600" />
        <KpiCard label="Demanded"           value={formatCurrency(totals.demanded)}    color="text-orange-600" />
        <KpiCard label="Active Obligations" value={totals.obligations.toLocaleString()} />
        <KpiCard label="Carriers Owing"     value={totals.insurers.toLocaleString()} />
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Outstanding Balance by Carrier (top 10)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => formatCurrency(v)} />
            <Bar dataKey="outstanding" name="Outstanding" radius={[4,4,0,0]}>
              {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <SectionHeader title="Detail by Carrier" onPDF={handlePDF} onExcel={handleExcel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Carrier</th>
                <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-center">#</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Obligated</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Paid</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Outstanding</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Demanded</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Disputed</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-2.5 text-slate-600 text-center">{r.count}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap text-right">{formatCurrency(r.total)}</td>
                  <td className="px-3 py-2.5 text-green-600 whitespace-nowrap text-right">{formatCurrency(r.paid)}</td>
                  <td className="px-3 py-2.5 font-semibold text-red-600 whitespace-nowrap text-right">{formatCurrency(r.total - r.paid)}</td>
                  <td className="px-3 py-2.5 text-orange-600 whitespace-nowrap text-right">{formatCurrency(r.demanded)}</td>
                  <td className="px-3 py-2.5 text-amber-600 whitespace-nowrap text-right">{formatCurrency(r.disputed)}</td>
                  <td className="px-3 py-2.5 text-amber-500 whitespace-nowrap text-right">{formatCurrency(r.pending)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2.5 text-slate-700">Total</td>
                <td className="px-2 py-2.5 text-slate-600 text-center">{totals.obligations}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">{formatCurrency(data.reduce((s,r)=>s+r.total,0))}</td>
                <td className="px-3 py-2.5 text-green-600 whitespace-nowrap text-right">{formatCurrency(data.reduce((s,r)=>s+r.paid,0))}</td>
                <td className="px-3 py-2.5 text-red-600 whitespace-nowrap text-right">{formatCurrency(totals.outstanding)}</td>
                <td className="px-3 py-2.5 text-orange-600 whitespace-nowrap text-right">{formatCurrency(totals.demanded)}</td>
                <td className="px-3 py-2.5 text-amber-600 whitespace-nowrap text-right">{formatCurrency(data.reduce((s,r)=>s+r.disputed,0))}</td>
                <td className="px-3 py-2.5 text-amber-500 whitespace-nowrap text-right">{formatCurrency(data.reduce((s,r)=>s+r.pending,0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 2 — Payment Velocity
// ═══════════════════════════════════════════════════════════════════════════════
function VelocityReport({ data, dateLabel }) {
  const overall = useMemo(() => {
    if (!data.length) return null
    const totalCount = data.reduce((s, r) => s + r.count, 0)
    const totalDays  = data.reduce((s, r) => s + r.totalDays, 0)
    const sorted     = [...data].sort((a, b) => a.avg - b.avg)
    return {
      avg:     Math.round(totalDays / totalCount),
      count:   totalCount,
      fastest: sorted[0]?.name,
      slowest: sorted[sorted.length - 1]?.name,
    }
  }, [data])

  const chartData = data.map(r => ({
    name: r.name.replace('[DEMO] ', '').slice(0, 22),
    avg: r.avg, min: r.min, max: r.max,
  }))

  const headers   = ['Insurer / Carrier', 'Payments Received', 'Avg Days (Demand→Payment)', 'Fastest (days)', 'Slowest (days)', 'Total Collected']
  const tableRows = data.map(r => [r.name, r.count, r.avg, r.min, r.max, r.totalAmount])
  const kpis = [
    { label: 'Overall Avg Days', value: overall ? `${overall.avg}d` : '—' },
    { label: 'Payments Tracked', value: overall?.count ?? '—' },
    { label: 'Fastest Carrier',  value: overall?.fastest ?? '—' },
    { label: 'Slowest Carrier',  value: overall?.slowest ?? '—' },
  ]

  const handlePDF = async () => exportPDF({
    title:     'Payment Velocity by Carrier',
    dateLabel,
    kpis,
    columns:   headers,
    rows:      tableRows.map(r => [r[0], r[1], `${r[2]}d`, `${r[3]}d`, `${r[4]}d`, formatCurrency(r[5])]),
    filename:  `payment-velocity-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Payment Velocity',
    headers,
    rows:         tableRows,
    colWidths:    [32, 18, 26, 14, 14, 18],
    currencyCols: [5],
    filename:     `payment-velocity-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (!data.length) return (
    <div className="card p-12 text-center text-slate-400">
      <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No payment velocity data for {dateLabel}.</p>
      <p className="text-xs">Requires obligations with both a demand date and a confirmed payment date.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Overall Avg Days"  value={overall ? `${overall.avg} days` : '—'} sub="Demand → receipt" color="text-brand-700" />
        <KpiCard label="Payments Tracked"  value={overall?.count?.toLocaleString() ?? '—'} />
        <KpiCard label="Fastest Carrier"   value={overall?.fastest ?? '—'} color="text-green-600" />
        <KpiCard label="Slowest Carrier"   value={overall?.slowest ?? '—'} color="text-red-600" />
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Avg / Min / Max Days by Carrier</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `${v}d`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [`${v} days`, name === 'avg' ? 'Avg' : name === 'min' ? 'Fastest' : 'Slowest']} />
            <Bar dataKey="min" name="Fastest" fill="#16a34a" radius={[3,3,0,0]} />
            <Bar dataKey="avg" name="Avg"     fill="#4f46e5" radius={[3,3,0,0]} />
            <Bar dataKey="max" name="Slowest" fill="#dc2626" radius={[3,3,0,0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <SectionHeader title="Velocity Detail by Carrier" onPDF={handlePDF} onExcel={handleExcel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Carrier</th>
                <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-center">Pmts</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Avg</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Fastest</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Slowest</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Collected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-medium text-slate-800">{r.name}</td>
                  <td className="px-2 py-2.5 text-slate-600 text-center">{r.count}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`font-semibold ${r.avg <= 30 ? 'text-green-600' : r.avg <= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {r.avg}d
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-green-600 text-right">{r.min}d</td>
                  <td className="px-3 py-2.5 text-red-500 text-right">{r.max}d</td>
                  <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap text-right">{formatCurrency(r.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 px-5 pb-3 pt-2">
          Velocity calculated only for obligations with both a demand date and a confirmed payment date recorded.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 3 — Invoice Category Breakdown
// ═══════════════════════════════════════════════════════════════════════════════
function CategoriesReport({ data, dateLabel }) {
  const total      = data.reduce((s, r) => s + r.total, 0)
  const totalItems = data.reduce((s, r) => s + r.count, 0)
  const top        = data[0]
  const pieData    = data.map(r => ({ name: r.category, value: r.total }))

  const headers   = ['Category', 'Line Items', 'Total Amount', '% of Total', 'Total Hours']
  const tableRows = data.map(r => [r.category, r.count, r.total, `${r.pct.toFixed(1)}%`, r.hours > 0 ? r.hours.toFixed(1) : ''])
  const kpis = [
    { label: 'Total Billed',  value: formatCurrency(total)           },
    { label: 'Line Items',    value: totalItems.toLocaleString()      },
    { label: 'Top Category',  value: `${top?.category ?? '—'} — ${top ? formatCurrency(top.total) : ''}` },
    { label: 'Categories',    value: data.length                      },
  ]

  const handlePDF = async () => exportPDF({
    title:     'Invoice Category Breakdown',
    dateLabel,
    kpis,
    columns:   headers,
    rows:      tableRows.map(r => [r[0], r[1], formatCurrency(Number(r[2])), r[3], r[4]]),
    filename:  `invoice-categories-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Invoice Categories',
    headers,
    rows:         tableRows,
    colWidths:    [20, 12, 16, 12, 12],
    currencyCols: [2],
    filename:     `invoice-categories-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (!data.length) return (
    <div className="card p-12 text-center text-slate-400">
      <Layers className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p>No invoice line item data found for {dateLabel}.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Billed"  value={formatCurrency(total)} color="text-brand-700" />
        <KpiCard label="Line Items"    value={totalItems.toLocaleString()} />
        <KpiCard label="Top Category"  value={top?.category ?? '—'} sub={top ? formatCurrency(top.total) : ''} />
        <KpiCard label="Categories"    value={data.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">Billing by Category</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={false}>
                {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">Amount by Category</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.map(r => ({ name: r.category, amount: r.total }))} layout="vertical" margin={{ top: 4, right: 16, left: 80, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={76} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="amount" name="Billed" radius={[0,4,4,0]}>
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card overflow-hidden">
        <SectionHeader title="Category Detail" onPDF={handlePDF} onExcel={handleExcel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Category</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Lines</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Amount</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">% of Total</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5">
                    <span className={`badge capitalize ${STATUS_COLORS[r.category] ?? 'bg-slate-100 text-slate-600'}`}>{r.category}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 text-right">{r.count.toLocaleString()}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap text-right">{formatCurrency(r.total)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[50px]">
                        <div className="h-1.5 rounded-full" style={{ width: `${r.pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                      <span className="text-slate-600 text-xs w-10 text-right">{r.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 text-right">{r.hours > 0 ? `${r.hours.toFixed(1)}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2.5 text-slate-700">Total</td>
                <td className="px-3 py-2.5 text-slate-600 text-right">{totalItems.toLocaleString()}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-right">{formatCurrency(total)}</td>
                <td className="px-3 py-2.5 text-slate-500">100%</td>
                <td className="px-3 py-2.5 text-slate-500 text-right">{data.reduce((s,r)=>s+r.hours,0).toFixed(1)}h</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 4 — Matter Aging
// ═══════════════════════════════════════════════════════════════════════════════
function AgingReport({ data, dateLabel }) {
  const buckets = useMemo(() => ({
    '90–180 days':  data.filter(m => m.oldestDays >= 90  && m.oldestDays < 180),
    '180–365 days': data.filter(m => m.oldestDays >= 180 && m.oldestDays < 365),
    '365+ days':    data.filter(m => m.oldestDays >= 365),
  }), [data])

  const totalOutstanding = data.reduce((s, m) => s + m.total, 0)

  const ageBucket = d => d >= 365
    ? { label: '365+ days',    cls: 'bg-red-100 text-red-700'    }
    : d >= 180
    ? { label: '180–365 days', cls: 'bg-orange-100 text-orange-700' }
    : { label: '90–180 days',  cls: 'bg-amber-100 text-amber-700' }

  const chartData = Object.entries(buckets).map(([label, items]) => ({
    label,
    count:       items.length,
    outstanding: items.reduce((s, m) => s + m.total, 0),
  }))

  const headers   = ['Matter', 'Matter Number', 'Days Outstanding', 'Age Bucket', 'Obligations', 'Total Outstanding']
  const tableRows = data.map(m => [m.name, m.number ?? '', m.oldestDays, ageBucket(m.oldestDays).label, m.count, m.total])
  const kpis = [
    { label: 'Matters 90+ Days',  value: data.length                                                   },
    { label: 'Matters 180+ Days', value: buckets['180–365 days'].length + buckets['365+ days'].length  },
    { label: 'Matters 365+ Days', value: buckets['365+ days'].length                                   },
    { label: 'Total Outstanding', value: formatCurrency(totalOutstanding)                              },
  ]

  const handlePDF = async () => exportPDF({
    title:     'Matter Aging Report (90+ Days)',
    dateLabel,
    kpis,
    columns:   headers,
    rows:      tableRows.map(r => [r[0], r[1], `${r[2]}d`, r[3], r[4], formatCurrency(Number(r[5]))]),
    filename:  `matter-aging-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Matter Aging',
    headers,
    rows:         tableRows,
    colWidths:    [36, 16, 16, 18, 14, 20],
    currencyCols: [5],
    filename:     `matter-aging-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (!data.length) return (
    <div className="card p-12 text-center text-slate-400">
      <TrendingUp className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No matters with obligations outstanding 90+ days.</p>
      <p className="text-xs">Shows matters where at least one obligation has been outstanding for 90 or more days.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Matters 90+ Days"  value={data.length}                                                  color="text-amber-600" />
        <KpiCard label="Matters 180+ Days" value={buckets['180–365 days'].length + buckets['365+ days'].length} color="text-orange-600" />
        <KpiCard label="Matters 365+ Days" value={buckets['365+ days'].length}                                  color="text-red-600" />
        <KpiCard label="Total Outstanding" value={formatCurrency(totalOutstanding)}                              color="text-red-600" />
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Matters by Age Bucket</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="l" orientation="left"  tickFormatter={v => v}                           tick={{ fontSize: 11 }} />
            <YAxis yAxisId="r" orientation="right" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => name === 'count' ? [`${v} matters`, 'Count'] : [formatCurrency(v), 'Outstanding']} />
            <Bar yAxisId="l" dataKey="count"       name="count"       fill="#f59e0b" radius={[4,4,0,0]} />
            <Bar yAxisId="r" dataKey="outstanding" name="outstanding" fill="#dc2626" radius={[4,4,0,0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <SectionHeader title={`${data.length} matters with obligations 90+ days outstanding`} onPDF={handlePDF} onExcel={handleExcel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Matter</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Matter #</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Days Out</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Bucket</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Oblig.</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((m, i) => {
                const { label, cls } = ageBucket(m.oldestDays)
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[240px]">
                      <p className="truncate">{m.name}</p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{m.number || '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700 text-right">{m.oldestDays}d</td>
                    <td className="px-3 py-2.5"><span className={`badge text-xs ${cls}`}>{label}</span></td>
                    <td className="px-3 py-2.5 text-slate-600 text-right">{m.count}</td>
                    <td className="px-3 py-2.5 font-semibold text-red-600 whitespace-nowrap text-right">{formatCurrency(m.total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2.5 text-slate-700" colSpan={4}>Total</td>
                <td className="px-3 py-2.5 text-right">{data.reduce((s,m)=>s+m.count,0)}</td>
                <td className="px-3 py-2.5 text-red-600 whitespace-nowrap text-right">{formatCurrency(totalOutstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-slate-400 px-5 pb-3 pt-2">
          Days measured from demand date, or obligation creation date if not yet demanded.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 5 — Settlement Comparison
// ═══════════════════════════════════════════════════════════════════════════════
function SettlementReport({ data }) {
  const totals = useMemo(() => ({
    count:     data.length,
    demanded:  data.reduce((s, r) => s + r.totalDemanded,  0),
    settled:   data.reduce((s, r) => s + r.totalSettled,   0),
    reserved:  data.reduce((s, r) => s + r.totalReserve,   0),
    savings:   data.reduce((s, r) => s + r.savings,        0),
  }), [data])

  const chartData = data.slice(0, 12).map(r => ({
    name:     r.matterName.slice(0, 20),
    demanded: parseFloat(r.totalDemanded.toFixed(2)),
    settled:  parseFloat(r.totalSettled.toFixed(2)),
  }))

  const headers   = ['Matter', 'Matter #', 'Settlement Date', 'Status', 'Total Demanded', 'Total Reserved', 'Total Settled', 'Savings', '% Reduction']
  const tableRows = data.map(r => [
    r.matterName, r.matterNumber ?? '', r.settlementDate, r.status,
    r.totalDemanded, r.totalReserve, r.totalSettled, r.savings,
    r.totalDemanded > 0 ? `${Math.round((r.savings / r.totalDemanded) * 100)}%` : '—',
  ])
  const kpis = [
    { label: 'Settled Matters',   value: totals.count                          },
    { label: 'Total Demanded',    value: formatCurrency(totals.demanded)        },
    { label: 'Total Settled',     value: formatCurrency(totals.settled)         },
    { label: 'Total Savings',     value: formatCurrency(totals.savings)         },
  ]

  const handlePDF = async () => exportPDF({
    title:    'Settlement Comparison',
    dateLabel: 'All time',
    kpis,
    columns:  headers,
    rows:     tableRows.map(r => [r[0], r[1], r[2], r[3], formatCurrency(r[4]), formatCurrency(r[5]), formatCurrency(r[6]), formatCurrency(r[7]), r[8]]),
    filename: `settlement-comparison-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Settlement Comparison',
    headers,
    rows:         tableRows,
    colWidths:    [36, 14, 16, 10, 16, 16, 16, 14, 12],
    currencyCols: [4, 5, 6, 7],
    filename:     `settlement-comparison-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (!data.length) return (
    <div className="card p-12 text-center text-slate-400">
      <Scale className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No settlements recorded yet.</p>
      <p className="text-xs">Record a settlement from the Settlement tab inside any matter.</p>
    </div>
  )

  const savingsPct = totals.demanded > 0
    ? Math.round((totals.savings / totals.demanded) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Settled Matters"  value={totals.count}                              />
        <KpiCard label="Total Demanded"   value={formatCurrency(totals.demanded)}           color="text-slate-700" />
        <KpiCard label="Total Settled"    value={formatCurrency(totals.settled)}            color="text-brand-700" />
        <KpiCard
          label="Total Savings"
          value={formatCurrency(totals.savings)}
          sub={`${savingsPct}% below demand`}
          color={totals.savings >= 0 ? 'text-green-600' : 'text-red-600'}
        />
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Demanded vs. Settled by Matter (top 12)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => formatCurrency(v)} />
            <Bar dataKey="demanded" name="Demanded" fill="#94a3b8" radius={[4,4,0,0]} />
            <Bar dataKey="settled"  name="Settled"  fill="#4f46e5" radius={[4,4,0,0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-hidden">
        <SectionHeader title="Settlement Detail by Matter" onPDF={handlePDF} onExcel={handleExcel} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Matter</th>
                <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">#</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Settled</th>
                <th className="px-2 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Demanded</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Reserved</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Settled</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Savings</th>
                <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Reduction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => {
                const reductionPct = r.totalDemanded > 0
                  ? Math.round((r.savings / r.totalDemanded) * 100)
                  : null
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[180px]">
                      <p className="truncate">{r.matterName}</p>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-xs text-slate-500">{r.matterNumber || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs">{r.settlementDate}</td>
                    <td className="px-2 py-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${r.status === 'final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-right">{formatCurrency(r.totalDemanded)}</td>
                    <td className="px-3 py-2.5 text-amber-600 whitespace-nowrap text-right">{formatCurrency(r.totalReserve)}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap text-right">{formatCurrency(r.totalSettled)}</td>
                    <td className={`px-3 py-2.5 font-semibold whitespace-nowrap text-right ${r.savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {r.savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(r.savings))}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {reductionPct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-green-500"
                              style={{ width: `${Math.min(Math.max(reductionPct, 0), 100)}%` }}
                            />
                          </div>
                          <span className="text-xs">{reductionPct}%</span>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td colSpan={4} className="px-3 py-2.5 text-slate-700">Total ({totals.count})</td>
                <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap text-right">{formatCurrency(totals.demanded)}</td>
                <td className="px-3 py-2.5 text-amber-600 whitespace-nowrap text-right">{formatCurrency(totals.reserved)}</td>
                <td className="px-3 py-2.5 text-slate-800 whitespace-nowrap text-right">{formatCurrency(totals.settled)}</td>
                <td className={`px-3 py-2.5 whitespace-nowrap text-right ${totals.savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totals.savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(totals.savings))}
                </td>
                <td className="px-3 py-2.5 text-slate-600 text-xs">{savingsPct}% avg</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 6 — Demand Letters
// ═══════════════════════════════════════════════════════════════════════════════
// AR Aging / Collections tab
// ═══════════════════════════════════════════════════════════════════════════════
function CollectionsAgingReport({ rows }) {
  const [groupBy,      setGroupBy]      = useState('insurer') // 'insurer' | 'firm'
  const [filterBucket, setFilterBucket] = useState('all')
  const [sortKey,      setSortKey]      = useState('days')
  const [sortDir,      setSortDir]      = useState('desc')
  const [search,       setSearch]       = useState('')

  const today = useMemo(() => new Date(), [])

  const enriched = useMemo(() => rows.map(r => {
    const demanded        = r.demanded_at ? parseISO(r.demanded_at) : null
    const daysSinceDemand = demanded ? differenceInDays(today, demanded) : 0
    const balance         = Math.max(0, Number(r.amount || 0) - Number(r.amount_paid || 0))
    const bucket          = agingBucket(daysSinceDemand)
    return {
      ...r,
      daysSinceDemand,
      balance,
      bucket,
      insurer:   r.la_insurers?.name                        || 'Unknown Insurer',
      firm:      r.la_apportionments?.la_invoices?.billing_firm || 'Unknown Firm',
      matter:    r.la_apportionments?.la_matters?.name      || 'Unknown Matter',
      matterNum: r.la_apportionments?.la_matters?.matter_number || '',
    }
  }), [rows, today])

  // ── Summary totals ────────────────────────────────────────────────────────
  const totalOutstanding = enriched.reduce((s, r) => s + r.balance, 0)
  const bucketSummary    = useMemo(() => AGING_BUCKETS.map(b => ({
    ...b,
    amount: enriched.filter(r => r.bucket === b.key).reduce((s, r) => s + r.balance, 0),
    count:  enriched.filter(r => r.bucket === b.key).length,
  })), [enriched])

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const map = {}
    enriched.forEach(r => {
      const key = groupBy === 'insurer' ? r.insurer : r.firm
      if (!map[key]) map[key] = { name: key, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 }
      map[key][r.bucket] += r.balance
      map[key].total     += r.balance
    })
    return Object.values(map)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map(d => ({ ...d, name: d.name.length > 22 ? d.name.slice(0, 20) + '…' : d.name }))
  }, [enriched, groupBy])

  // ── Table rows ────────────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    let rows = filterBucket === 'all' ? enriched : enriched.filter(r => r.bucket === filterBucket)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r =>
        r.matter.toLowerCase().includes(q) ||
        r.insurer.toLowerCase().includes(q) ||
        r.firm.toLowerCase().includes(q) ||
        (r.lexalloc_invoice_number || '').toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'days')    cmp = b.daysSinceDemand - a.daysSinceDemand
      if (sortKey === 'balance') cmp = b.balance - a.balance
      if (sortKey === 'matter')  cmp = a.matter.localeCompare(b.matter)
      if (sortKey === 'insurer') cmp = a.insurer.localeCompare(b.insurer)
      return sortDir === 'desc' ? cmp : -cmp
    })
  }, [enriched, filterBucket, search, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-slate-300 ml-1 inline" />
    return sortDir === 'desc'
      ? <ArrowDown className="h-3 w-3 text-brand-600 ml-1 inline" />
      : <ArrowUp   className="h-3 w-3 text-brand-600 ml-1 inline" />
  }

  function handleExportXLSX() {
    exportXLSX({
      sheetName:   'AR Aging',
      filename:    `LexAlloc_AR_Aging_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
      headers:     ['Matter', 'Matter No.', 'Insurer', 'Billing Firm', 'LexAlloc Invoice #', 'Amount Demanded', 'Balance Due', 'Date Demanded', 'Days Outstanding', 'Bucket', 'Status'],
      colWidths:   [30, 14, 28, 22, 22, 16, 16, 16, 10, 10, 14],
      currencyCols:[5, 6],
      rows: tableRows.map(r => [
        r.matter,
        r.matterNum || '—',
        r.insurer,
        r.firm,
        r.lexalloc_invoice_number || '—',
        Number(r.amount || 0),
        r.balance,
        r.demanded_at ? format(parseISO(r.demanded_at), 'MM/dd/yyyy') : '—',
        r.daysSinceDemand,
        r.bucket,
        r.payment_status || '—',
      ]),
    })
  }

  if (rows.length === 0) {
    return (
      <div className="card p-16 text-center">
        <Timer className="h-8 w-8 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">No outstanding demand letters</p>
        <p className="text-slate-400 text-sm mt-1">Send demand letters from an apportionment to start tracking collections here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ── Summary bucket cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Total card */}
        <div className="card p-4 sm:col-span-1 flex flex-col">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total Outstanding</p>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalOutstanding)}</p>
          <p className="text-xs text-slate-400 mt-1">{enriched.length} demand{enriched.length !== 1 ? 's' : ''}</p>
        </div>
        {/* Bucket cards */}
        {bucketSummary.map(b => (
          <button
            key={b.key}
            onClick={() => setFilterBucket(filterBucket === b.key ? 'all' : b.key)}
            className={`card p-4 text-left transition-all hover:shadow-md ${b.bg} ${b.border} border-2 ${filterBucket === b.key ? 'ring-2 ring-offset-1 ring-brand-500' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: b.color }}>{b.label}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.badge}`}>{b.count}</span>
            </div>
            <p className="text-lg font-bold text-slate-900">{formatCurrency(b.amount)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{b.sublabel}</p>
          </button>
        ))}
      </div>

      {/* ── Chart ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-900">Outstanding Balance by Aging Bucket</h3>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {[['insurer', 'By Insurer'], ['firm', 'By Firm']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${groupBy === key ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >{label}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 12, left: 8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
            <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
            {AGING_BUCKETS.map(b => (
              <Bar key={b.key} dataKey={b.key} name={b.sublabel} stackId="a" fill={b.color} radius={b.key === '90+' ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search matter, insurer, firm, or invoice…"
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
          </div>
          <div className="flex items-center gap-2">
            {filterBucket !== 'all' && (
              <button onClick={() => setFilterBucket('all')} className="text-xs text-brand-600 hover:underline">
                Clear filter
              </button>
            )}
            <button onClick={handleExportXLSX} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
              <FileSpreadsheet className="h-3.5 w-3.5" /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('matter')} className="flex items-center">Matter <SortIcon col="matter" /></button>
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('insurer')} className="flex items-center">Insurer <SortIcon col="insurer" /></button>
                </th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Firm</th>
                <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Inv #</th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('balance')} className="flex items-center ml-auto">Balance <SortIcon col="balance" /></button>
                </th>
                <th className="text-right px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  <button onClick={() => toggleSort('days')} className="flex items-center ml-auto">Days <SortIcon col="days" /></button>
                </th>
                <th className="text-center px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Bucket</th>
                <th className="text-center px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {tableRows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">No records match your filters.</td></tr>
              )}
              {tableRows.map(r => {
                const bucket = AGING_BUCKETS.find(b => b.key === r.bucket)
                return (
                  <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800 truncate max-w-[160px]">{r.matter}</p>
                      {r.matterNum && <p className="text-xs text-slate-400">{r.matterNum}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 truncate max-w-[140px]">{r.insurer}</td>
                    <td className="px-3 py-2.5 text-slate-500 hidden md:table-cell truncate max-w-[120px]">{r.firm}</td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs hidden lg:table-cell">{r.lexalloc_invoice_number || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-900 whitespace-nowrap">{formatCurrency(r.balance)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`font-bold ${r.daysSinceDemand >= 90 ? 'text-red-600' : r.daysSinceDemand >= 60 ? 'text-orange-500' : r.daysSinceDemand >= 30 ? 'text-amber-500' : 'text-slate-700'}`}>
                        {r.daysSinceDemand}d
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${bucket?.badge || ''}`}>{bucket?.label || r.bucket}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[r.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                        {(r.payment_status || '—').replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-400">
          {tableRows.length} record{tableRows.length !== 1 ? 's' : ''} ·{' '}
          {formatCurrency(tableRows.reduce((s, r) => s + r.balance, 0))} outstanding
          {filterBucket !== 'all' && ` · filtered to ${AGING_BUCKETS.find(b => b.key === filterBucket)?.sublabel}`}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function DemandLettersReport({ rows, sendLog, dateLabel }) {
  const navigate = useNavigate()
  // Tracks which matter rows are expanded. Starts collapsed — high-level view
  // by default; user clicks a matter to drill into its individual letters.
  const [expandedMatters, setExpandedMatters] = useState(new Set())
  const toggleMatter = (id) =>
    setExpandedMatters(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Build map: insurer_apportionment_id → sorted send events
  const sendMap = useMemo(() => {
    const m = {}
    for (const s of sendLog) {
      const key = s.insurer_apportionment_id
      if (!m[key]) m[key] = []
      m[key].push(s)
    }
    for (const key of Object.keys(m)) {
      m[key].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
    }
    return m
  }, [sendLog])

  const today = new Date()

  const enriched = useMemo(() => rows.map(r => {
    const sends      = sendMap[r.id] || []
    const lastSend   = sends[0]
    const demanded   = r.demanded_at ? parseISO(r.demanded_at) : null
    const isPaid     = r.payment_status === 'paid'
    const daysOut    = demanded
      ? isPaid && r.payment_date
        ? differenceInDays(parseISO(r.payment_date), demanded)
        : differenceInDays(today, demanded)
      : null
    const balance    = Number(r.amount || 0) - Number(r.amount_paid || 0)
    return { ...r, sends, lastSend, daysOut, balance, isPaid }
  }), [rows, sendMap])

  // Sort unpaid first, then by days outstanding desc
  const sorted = useMemo(() =>
    [...enriched].sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1
      return (b.daysOut ?? 0) - (a.daysOut ?? 0)
    }),
  [enriched])

  const unpaid = sorted.filter(r => !r.isPaid)
  const kpis   = useMemo(() => ({
    total:        sorted.length,
    outstanding:  unpaid.reduce((s, r) => s + r.balance, 0),
    delinquent:   unpaid.filter(r => r.daysOut >= 90).length,
    collected:    sorted.reduce((s, r) => s + Number(r.amount_paid || 0), 0),
  }), [sorted, unpaid])

  // Group letters by matter. Each group keeps its own letter list and rolled-up
  // stats — total demanded / outstanding / paid count / worst delinquency band.
  const matterGroups = useMemo(() => {
    const m = new Map()
    for (const r of sorted) {
      const matter   = r.la_apportionments?.la_matters
      const matterId = matter?.id || '__unknown__'
      if (!m.has(matterId)) {
        m.set(matterId, {
          matterId,
          matterName:   matter?.name          || 'Unknown matter',
          matterNumber: matter?.matter_number || null,
          letters:      [],
        })
      }
      m.get(matterId).letters.push(r)
    }
    const groups = []
    for (const g of m.values()) {
      const ls = g.letters
      const unpaidLetters = ls.filter(r => !r.isPaid)
      const maxDays = unpaidLetters.length
        ? Math.max(...unpaidLetters.filter(r => r.daysOut != null).map(r => r.daysOut), 0)
        : 0
      groups.push({
        ...g,
        total_letters:    ls.length,
        paid_count:       ls.filter(r => r.isPaid).length,
        unpaid_count:     unpaidLetters.length,
        total_demanded:   ls.reduce((s, r) => s + Number(r.amount || 0), 0),
        total_paid:       ls.reduce((s, r) => s + Number(r.amount_paid || 0), 0),
        total_outstanding:unpaidLetters.reduce((s, r) => s + r.balance, 0),
        max_days_out:     maxDays,
        delinquent_count: unpaidLetters.filter(r => (r.daysOut ?? 0) >= 90).length,
        last_sent:        ls.reduce((latest, r) => {
          if (!r.lastSend) return latest
          return !latest || new Date(r.lastSend.sent_at) > new Date(latest) ? r.lastSend.sent_at : latest
        }, null),
      })
    }
    // Outstanding matters first (any unpaid), then by outstanding amount desc
    return groups.sort((a, b) => {
      if ((a.unpaid_count > 0) !== (b.unpaid_count > 0)) return a.unpaid_count > 0 ? -1 : 1
      return b.total_outstanding - a.total_outstanding
    })
  }, [sorted])

  const bandData = useMemo(() => {
    return DELINQUENCY_BANDS.map(b => ({
      ...b,
      count: unpaid.filter(r => {
        const d = r.daysOut ?? 0
        const prevMax = DELINQUENCY_BANDS[DELINQUENCY_BANDS.indexOf(b) - 1]?.max ?? 0
        return d > prevMax && d <= b.max
      }).length,
      amount: unpaid.filter(r => {
        const d = r.daysOut ?? 0
        const prevMax = DELINQUENCY_BANDS[DELINQUENCY_BANDS.indexOf(b) - 1]?.max ?? 0
        return d > prevMax && d <= b.max
      }).reduce((s, r) => s + r.balance, 0),
    }))
  }, [unpaid])

  const headers   = ['LexAlloc Invoice No.', 'Matter', 'Insurer', 'Amount', 'Paid', 'Balance', 'Status', 'Date Demanded', 'Days Out', 'Emails Sent', 'Last Email']
  const xlsxRows  = sorted.map(r => [
    r.lexalloc_invoice_number || '—',
    r.la_apportionments?.la_matters?.name || '—',
    r.la_insurers?.name || '—',
    Number(r.amount || 0),
    Number(r.amount_paid || 0),
    r.balance,
    r.payment_status || '—',
    r.demanded_at ? format(parseISO(r.demanded_at), 'MM/dd/yyyy') : '—',
    r.daysOut ?? '—',
    r.sends.length,
    r.lastSend ? format(parseISO(r.lastSend.sent_at), 'MM/dd/yyyy') : '—',
  ])

  const pdfRows = sorted.map(r => [
    r.lexalloc_invoice_number || '—',
    (r.la_apportionments?.la_matters?.name || '—').slice(0, 28),
    (r.la_insurers?.name || '—').slice(0, 22),
    formatCurrency(Number(r.amount || 0)),
    formatCurrency(Number(r.amount_paid || 0)),
    formatCurrency(r.balance),
    r.payment_status || '—',
    r.demanded_at ? format(parseISO(r.demanded_at), 'MM/dd/yy') : '—',
    r.daysOut != null ? `${r.daysOut}d` : '—',
    r.sends.length,
    r.lastSend ? format(parseISO(r.lastSend.sent_at), 'MM/dd/yy') : '—',
  ])

  const kpiList = [
    { label: 'Letters Sent',    value: kpis.total },
    { label: 'Outstanding',     value: formatCurrency(kpis.outstanding) },
    { label: 'Delinquent 90+',  value: kpis.delinquent },
    { label: 'Total Collected', value: formatCurrency(kpis.collected) },
  ]

  const handlePDF = async () => exportPDF({
    title:    'Demand Letters',
    dateLabel,
    kpis:     kpiList,
    columns:  headers,
    rows:     pdfRows,
    filename: `demand-letters-${format(new Date(), 'yyyy-MM-dd')}.pdf`,
  })

  const handleExcel = () => exportXLSX({
    sheetName:    'Demand Letters',
    headers,
    rows:         xlsxRows,
    colWidths:    [22, 30, 24, 14, 14, 14, 14, 14, 10, 12, 14],
    currencyCols: [3, 4, 5],
    filename:     `demand-letters-${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
  })

  if (!sorted.length) return (
    <div className="card p-12 text-center text-slate-400">
      <Mail className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No demand letters sent yet.</p>
      <p className="text-xs">Letters appear here once you generate and send them from the Apportionment tab.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Letters Sent"    value={kpis.total.toLocaleString()} />
        <KpiCard label="Outstanding"     value={formatCurrency(kpis.outstanding)} color="text-red-600" />
        <KpiCard label="Delinquent 90+"  value={kpis.delinquent.toLocaleString()} color={kpis.delinquent > 0 ? 'text-red-600' : 'text-slate-900'} />
        <KpiCard label="Total Collected" value={formatCurrency(kpis.collected)} color="text-green-600" />
      </div>

      {/* Delinquency bar chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Outstanding by Age Bucket</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bandData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatCurrency(v)} />
              <Bar dataKey="amount" name="Outstanding" radius={[4,4,0,0]}>
                {bandData.map((b, i) => (
                  <Cell key={i} fill={['#16a34a','#d97706','#ea580c','#dc2626'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-3">Delinquency Summary</p>
          <div className="space-y-3">
            {bandData.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap w-24 text-center ${b.cls}`}>
                  {b.label}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: unpaid.length > 0 ? `${Math.min((b.count / unpaid.length) * 100, 100)}%` : '0%',
                      backgroundColor: ['#16a34a','#d97706','#ea580c','#dc2626'][i],
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-6 text-right">{b.count}</span>
                <span className="text-xs text-slate-400 w-24 text-right">{formatCurrency(b.amount)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">Unpaid letters only · days since demand date</p>
        </div>
      </div>

      {/* Detail table — grouped by matter, click a matter to drill in */}
      <div className="card overflow-hidden">
        <SectionHeader
          title={`${matterGroups.length} matter${matterGroups.length !== 1 ? 's' : ''} · ${sorted.length} letter${sorted.length !== 1 ? 's' : ''}`}
          onPDF={handlePDF}
          onExcel={handleExcel}
        />

        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-500 flex items-center gap-2">
          <ChevronRight className="h-3 w-3" />
          Click a matter to expand its individual demand letters. Outstanding matters are listed first.
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                <th className="w-9 pl-4" />
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Matter</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide text-center whitespace-nowrap">Letters</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-right">Demanded</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-right">Paid</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap text-right">Outstanding</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Worst Status</th>
                <th className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Last Sent</th>
                <th className="w-9 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matterGroups.map(g => {
                const isExpanded = expandedMatters.has(g.matterId)
                const isAllPaid  = g.unpaid_count === 0
                const worstBand  = !isAllPaid && g.max_days_out > 0 ? delinquencyBand(g.max_days_out) : null
                const isUnknown  = g.matterId === '__unknown__'

                return (
                  <Fragment key={g.matterId}>
                    {/* Top-level matter summary row */}
                    <tr
                      onClick={() => toggleMatter(g.matterId)}
                      className={`cursor-pointer transition-colors ${isExpanded ? 'bg-brand-50/40' : 'hover:bg-slate-50'} ${isAllPaid ? 'opacity-80' : ''}`}
                    >
                      <td className="pl-4 py-3 text-slate-400">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-3 max-w-[260px]">
                        <p className="font-medium text-slate-900 truncate">{g.matterName}</p>
                        {g.matterNumber && (
                          <p className="text-xs text-slate-400 font-mono truncate">{g.matterNumber}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 text-xs">
                          <span className="font-semibold text-slate-700">{g.total_letters}</span>
                          {g.unpaid_count > 0 && (
                            <span className="text-red-500">· {g.unpaid_count} unpaid</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap text-right">
                        {formatCurrency(g.total_demanded)}
                      </td>
                      <td className="px-4 py-3 text-green-600 whitespace-nowrap text-right">
                        {formatCurrency(g.total_paid)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-semibold">
                        {isAllPaid
                          ? <span className="text-green-600">$0</span>
                          : <span className="text-red-600">{formatCurrency(g.total_outstanding)}</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {isAllPaid
                          ? <span className="badge text-xs bg-green-100 text-green-700">All paid</span>
                          : worstBand
                            ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`badge text-xs ${worstBand.cls}`}>{worstBand.label}</span>
                                <span className="text-xs text-slate-500">{g.max_days_out}d</span>
                              </span>
                            )
                            : <span className="badge text-xs bg-slate-100 text-slate-600">Demanded</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {g.last_sent ? format(parseISO(g.last_sent), 'MM/dd/yyyy') : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="pr-4 py-3 text-right">
                        {!isUnknown && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/matters/${g.matterId}`) }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 hover:underline"
                            title="Open matter"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* Expanded per-letter detail */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="p-0 bg-slate-50/50">
                          <div className="px-4 py-3 border-l-2 border-brand-200 ml-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 text-left">
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">LexAlloc Inv #</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Insurer</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide text-right">Amount</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide text-right">Paid</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide text-right">Balance</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Status</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">Demanded</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">Days Out</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide text-center">Emails</th>
                                  <th className="px-3 py-2 font-semibold uppercase tracking-wide whitespace-nowrap">Last Sent</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white rounded-lg overflow-hidden">
                                {g.letters.map((r, i) => {
                                  const band = r.daysOut != null && !r.isPaid ? delinquencyBand(r.daysOut) : null
                                  return (
                                    <tr key={r.id || i} className={`hover:bg-slate-50/60 ${r.isPaid ? 'opacity-70' : ''}`}>
                                      <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                                        {r.lexalloc_invoice_number || <span className="text-slate-400">—</span>}
                                      </td>
                                      <td className="px-3 py-2 text-slate-700 max-w-[180px]">
                                        <p className="truncate">{r.la_insurers?.name || '—'}</p>
                                      </td>
                                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap text-right">{formatCurrency(Number(r.amount || 0))}</td>
                                      <td className="px-3 py-2 text-green-600 whitespace-nowrap text-right">{formatCurrency(Number(r.amount_paid || 0))}</td>
                                      <td className="px-3 py-2 font-semibold whitespace-nowrap text-right">
                                        <span className={r.isPaid ? 'text-green-600' : 'text-red-600'}>{formatCurrency(r.balance)}</span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`badge text-xs capitalize ${STATUS_COLORS[r.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>
                                          {(r.payment_status || '—').replace('_', ' ')}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                        {r.demanded_at ? format(parseISO(r.demanded_at), 'MM/dd/yyyy') : '—'}
                                      </td>
                                      <td className="px-3 py-2 whitespace-nowrap">
                                        {r.daysOut != null ? (
                                          r.isPaid
                                            ? <span className="text-green-600 font-semibold">{r.daysOut}d</span>
                                            : <span className={`font-semibold ${band?.cls?.replace('bg-', 'text-').split(' ')[0] ?? 'text-slate-700'}`}>
                                                {r.daysOut}d
                                              </span>
                                        ) : '—'}
                                        {!r.isPaid && band && (
                                          <span className={`ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full ${band.cls}`}>{band.label}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-slate-600 text-center">{r.sends.length || '—'}</td>
                                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                        {r.lastSend
                                          ? <div>
                                              <p>{format(parseISO(r.lastSend.sent_at), 'MM/dd/yyyy')}</p>
                                              {r.lastSend.email_to && <p className="text-slate-400 truncate max-w-[140px]">{r.lastSend.email_to}</p>}
                                            </div>
                                          : <span className="text-slate-300">—</span>}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 px-5 pb-3 pt-2">
          Days outstanding measured from demand date. Paid rows show time from demand to payment receipt. PDF/Excel exports include every individual letter.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [tab,        setTab]        = useState('outstanding')
  const [preset,     setPreset]     = useState(2)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const isCustom = DATE_PRESETS[preset]?.days === 'custom'

  const dateFrom = useMemo(() => {
    if (isCustom) return customFrom ? customFrom + 'T00:00:00' : null
    const days = DATE_PRESETS[preset].days
    return days ? subDays(new Date(), days).toISOString() : null
  }, [preset, isCustom, customFrom])

  const dateTo = useMemo(() => {
    if (isCustom && customTo) return customTo + 'T23:59:59'
    return null
  }, [isCustom, customTo])

  const dateLabel = useMemo(() => {
    if (isCustom && customFrom && customTo) {
      return `${format(parseISO(customFrom), 'MM/dd/yy')} – ${format(parseISO(customTo), 'MM/dd/yy')}`
    }
    if (isCustom) return 'Custom range'
    return DATE_PRESETS[preset]?.label || 'All time'
  }, [preset, isCustom, customFrom, customTo])

  const { data: obligations = [], isLoading: obLoading } = useQuery({
    queryKey: ['report-obligations', dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('la_insurer_apportionments')
        .select(`
          id, amount, amount_paid, payment_status,
          demanded_at, payment_date, created_at,
          la_insurers(id, name),
          la_apportionments(id, matter_id,
            la_matters(id, name, matter_number)
          )
        `)
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo)   q = q.lte('created_at', dateTo)
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  const { data: settlements = [], isLoading: settlementLoading } = useQuery({
    queryKey: ['report-settlements'],
    enabled:  tab === 'settlements',
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_settlements')
        .select(`
          id, settlement_date, total_amount, status,
          matter:la_matters(id, name, matter_number),
          allocations:la_settlement_allocations(original_demand, reserve_amount, settlement_amount)
        `)
        .order('settlement_date', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: agingRows = [], isLoading: agingLoading } = useQuery({
    queryKey: ['report-collections-aging'],
    enabled:  tab === 'collections',
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_insurer_apportionments')
        .select(`
          id, amount, amount_paid, payment_status, demanded_at, payment_date, lexalloc_invoice_number,
          la_insurers(id, name),
          la_apportionments(
            id,
            la_invoices(billing_firm),
            la_matters(id, name, matter_number)
          )
        `)
        .not('demanded_at', 'is', null)
        .neq('payment_status', 'paid')
        .order('demanded_at', { ascending: true })
      if (error) throw error
      return data || []
    },
  })

  const { data: demandLetters = [], isLoading: dlLoading } = useQuery({
    queryKey: ['report-demand-letters'],
    enabled:  tab === 'demand_letters',
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_insurer_apportionments')
        .select(`
          id, amount, amount_paid, payment_status, demanded_at, payment_date,
          lexalloc_invoice_number, insurer_id,
          la_insurers(id, name),
          la_apportionments(
            id, matter_id,
            la_matters(id, name, matter_number)
          )
        `)
        .not('demanded_at', 'is', null)
        .order('demanded_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: sendLog = [], isLoading: slLoading } = useQuery({
    queryKey: ['report-send-log'],
    enabled:  tab === 'demand_letters',
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('la_payment_reminders')
        .select('id, insurer_apportionment_id, email_to, sent_at, triggered_by, status, schedule_type')
        .order('sent_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  const { data: lineItems = [], isLoading: liLoading } = useQuery({
    queryKey: ['report-line-items', dateFrom, dateTo],
    enabled:  tab === 'categories',
    queryFn: async () => {
      let q = supabase
        .from('la_invoice_line_items')
        .select('id, amount, category, hours, date_of_service')
      if (dateFrom) q = q.gte('date_of_service', dateFrom.split('T')[0])
      if (dateTo)   q = q.lte('date_of_service', dateTo.split('T')[0])
      const { data, error } = await q
      if (error) throw error
      return data || []
    },
  })

  // Report 1 — Outstanding by insurer
  const outstandingByInsurer = useMemo(() => {
    const map = {}
    obligations.filter(o => o.payment_status !== 'paid').forEach(o => {
      const name = o.la_insurers?.name || 'Unknown Insurer'
      const id   = o.la_insurers?.id   || 'unknown'
      if (!map[id]) map[id] = { name, count: 0, total: 0, paid: 0, pending: 0, demanded: 0, disputed: 0 }
      map[id].count++
      map[id].total += Number(o.amount      || 0)
      map[id].paid  += Number(o.amount_paid || 0)
      const bal = Number(o.amount || 0) - Number(o.amount_paid || 0)
      if      (o.payment_status === 'demanded') map[id].demanded += bal
      else if (o.payment_status === 'disputed') map[id].disputed += bal
      else                                       map[id].pending  += bal
    })
    return Object.values(map).sort((a, b) => (b.total - b.paid) - (a.total - a.paid))
  }, [obligations])

  // Report 2 — Payment velocity
  const velocityByInsurer = useMemo(() => {
    const map = {}
    obligations.filter(o => o.payment_status === 'paid' && o.demanded_at && o.payment_date).forEach(o => {
      const name = o.la_insurers?.name || 'Unknown Insurer'
      const id   = o.la_insurers?.id   || 'unknown'
      const days = differenceInDays(parseISO(o.payment_date), parseISO(o.demanded_at))
      if (days < 0) return
      if (!map[id]) map[id] = { name, count: 0, totalDays: 0, min: Infinity, max: -Infinity, totalAmount: 0 }
      map[id].count++
      map[id].totalDays   += days
      map[id].min          = Math.min(map[id].min, days)
      map[id].max          = Math.max(map[id].max, days)
      map[id].totalAmount += Number(o.amount || 0)
    })
    return Object.values(map)
      .map(r => ({ ...r, avg: Math.round(r.totalDays / r.count), min: r.min === Infinity ? 0 : r.min }))
      .sort((a, b) => a.avg - b.avg)
  }, [obligations])

  // Report 3 — Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map = {}
    lineItems.forEach(li => {
      const cat = li.category || 'uncategorized'
      if (!map[cat]) map[cat] = { category: cat, count: 0, total: 0, hours: 0 }
      map[cat].count++
      map[cat].total += Number(li.amount || 0)
      map[cat].hours += Number(li.hours  || 0)
    })
    const total = Object.values(map).reduce((s, r) => s + r.total, 0)
    return Object.values(map)
      .map(r => ({ ...r, pct: total > 0 ? (r.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [lineItems])

  // Report 4 — Matter aging
  const matterAging = useMemo(() => {
    const map = {}
    obligations.filter(o => o.payment_status !== 'paid').forEach(o => {
      const matter = o.la_apportionments?.la_matters
      if (!matter) return
      const id      = matter.id
      const refDate = o.demanded_at || o.created_at
      const days    = refDate ? differenceInDays(new Date(), parseISO(refDate)) : 0
      if (!map[id]) map[id] = { id, name: matter.name, number: matter.matter_number, count: 0, total: 0, oldestDays: 0 }
      map[id].count++
      map[id].total      += Number(o.amount || 0) - Number(o.amount_paid || 0)
      map[id].oldestDays  = Math.max(map[id].oldestDays, days)
    })
    return Object.values(map)
      .filter(m => m.oldestDays >= 90)
      .sort((a, b) => b.oldestDays - a.oldestDays)
  }, [obligations])

  // Report 5 — Settlement comparison
  const settlementComparison = useMemo(() => settlements.map(s => {
    const allocs        = s.allocations || []
    const totalDemanded = allocs.reduce((sum, a) => sum + Number(a.original_demand  || 0), 0)
    const totalSettled  = allocs.reduce((sum, a) => sum + Number(a.settlement_amount || 0), 0)
    const totalReserve  = allocs.reduce((sum, a) => sum + Number(a.reserve_amount   || 0), 0)
    return {
      matterName:     s.matter?.name         || 'Unknown Matter',
      matterNumber:   s.matter?.matter_number,
      settlementDate: s.settlement_date,
      status:         s.status,
      totalDemanded,
      totalSettled:   Number(s.total_amount) || totalSettled,
      totalReserve,
      savings:        totalDemanded - (Number(s.total_amount) || totalSettled),
    }
  }), [settlements])

  const isLoading = obLoading
    || (tab === 'collections'    && agingLoading)
    || (tab === 'categories'     && liLoading)
    || (tab === 'settlements'    && settlementLoading)
    || (tab === 'demand_letters' && (dlLoading || slLoading))

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-sm text-slate-500">Aggregated views across matters, obligations, and payments</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            {DATE_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPreset(i)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  preset === i ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {isCustom && (
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl px-3 py-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
                className="form-input text-xs py-1 h-auto flex-1 min-w-0"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
                className="form-input text-xs py-1 h-auto flex-1 min-w-0"
              />
            </div>
          )}
        </div>
      </div>

      {(() => {
        // The Demand Letters report has a lot of columns (the per-letter
        // detail table inside each expanded matter has 10), so when it's the
        // active tab we drop the sidebar and let the report use the full
        // width. The compact horizontal tab strip above keeps navigation
        // available without eating sidebar real estate.
        const isFullWidth = tab === 'demand_letters'

        const reportContent = isLoading ? (
          <div className="card p-16 text-center">
            <div className="h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Loading report data…</p>
          </div>
        ) : (
          <>
            {tab === 'outstanding'    && <OutstandingReport       data={outstandingByInsurer}  dateLabel={dateLabel} />}
            {tab === 'collections'    && <CollectionsAgingReport  rows={agingRows} />}
            {tab === 'velocity'       && <VelocityReport          data={velocityByInsurer}     dateLabel={dateLabel} />}
            {tab === 'categories'     && <CategoriesReport        data={categoryBreakdown}     dateLabel={dateLabel} />}
            {tab === 'aging'          && <AgingReport             data={matterAging}           dateLabel={dateLabel} />}
            {tab === 'settlements'    && <SettlementReport         data={settlementComparison} />}
            {tab === 'demand_letters' && <DemandLettersReport      rows={demandLetters} sendLog={sendLog} dateLabel={dateLabel} />}
          </>
        )

        if (isFullWidth) {
          return (
            <div>
              {/* Compact horizontal tab strip stands in for the sidebar so
                  the user can still switch reports without losing context. */}
              <div className="mb-6 overflow-x-auto -mx-1">
                <nav className="flex gap-1 px-1">
                  {TABS.map(t => {
                    const Icon = t.icon
                    const active = tab === t.key
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                        {t.label}
                      </button>
                    )
                  })}
                </nav>
              </div>
              {reportContent}
            </div>
          )
        }

        // Default sidebar layout for every other report.
        return (
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="lg:w-48 lg:flex-shrink-0">
              <nav className="flex flex-col gap-0.5 lg:sticky lg:top-6 bg-white lg:bg-transparent border lg:border-0 border-slate-200 rounded-xl p-2 lg:p-0">
                {TABS.map(t => {
                  const Icon = t.icon
                  const active = tab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${
                        active
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-brand-600' : 'text-slate-400'}`} />
                      <span className="flex-1 truncate">{t.label}</span>
                    </button>
                  )
                })}
              </nav>
            </aside>
            <div className="flex-1 min-w-0">{reportContent}</div>
          </div>
        )
      })()}
    </div>
  )
}
