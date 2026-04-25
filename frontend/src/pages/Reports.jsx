import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { differenceInDays, parseISO, subDays, format } from 'date-fns'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  AlertTriangle, Clock, Layers, TrendingUp, BarChart3,
  Download, FileSpreadsheet, FileText, ChevronDown, Scale,
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
  { label: 'Last 30 days',   days: 30  },
  { label: 'Last 90 days',   days: 90  },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time',       days: null },
]

const TABS = [
  { key: 'outstanding', label: 'Outstanding Obligations', icon: AlertTriangle },
  { key: 'velocity',    label: 'Payment Velocity',        icon: Clock         },
  { key: 'categories',  label: 'Invoice Categories',      icon: Layers        },
  { key: 'aging',       label: 'Matter Aging',            icon: TrendingUp    },
  { key: 'settlements', label: 'Settlements',             icon: Scale         },
]

// ═══════════════════════════════════════════════════════════════════════════════
// PDF export helper
// ═══════════════════════════════════════════════════════════════════════════════
function exportPDF({ title, dateLabel, kpis = [], columns, rows, filename }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })
  const W   = doc.internal.pageSize.getWidth()

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, W, 22, 'F')

  // Logo mark
  doc.setFillColor(...WHITE)
  doc.setDrawColor(...BRAND)
  doc.roundedRect(6, 5, 11, 11, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6)
  doc.setTextColor(...BRAND)
  doc.text('LA', 11.5, 12, { align: 'center' })

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
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
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

  const handlePDF = () => exportPDF({
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.count}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatCurrency(r.total)}</td>
                  <td className="px-4 py-3 text-green-600 whitespace-nowrap">{formatCurrency(r.paid)}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{formatCurrency(r.total - r.paid)}</td>
                  <td className="px-4 py-3 text-orange-600 whitespace-nowrap">{formatCurrency(r.demanded)}</td>
                  <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(r.disputed)}</td>
                  <td className="px-4 py-3 text-amber-500 whitespace-nowrap">{formatCurrency(r.pending)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700">Total</td>
                <td className="px-4 py-3 text-slate-600">{totals.obligations}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(data.reduce((s,r)=>s+r.total,0))}</td>
                <td className="px-4 py-3 text-green-600 whitespace-nowrap">{formatCurrency(data.reduce((s,r)=>s+r.paid,0))}</td>
                <td className="px-4 py-3 text-red-600 whitespace-nowrap">{formatCurrency(totals.outstanding)}</td>
                <td className="px-4 py-3 text-orange-600 whitespace-nowrap">{formatCurrency(totals.demanded)}</td>
                <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(data.reduce((s,r)=>s+r.disputed,0))}</td>
                <td className="px-4 py-3 text-amber-500 whitespace-nowrap">{formatCurrency(data.reduce((s,r)=>s+r.pending,0))}</td>
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

  const handlePDF = () => exportPDF({
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.count}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${r.avg <= 30 ? 'text-green-600' : r.avg <= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                      {r.avg}d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-green-600">{r.min}d</td>
                  <td className="px-4 py-3 text-red-500">{r.max}d</td>
                  <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">{formatCurrency(r.totalAmount)}</td>
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

  const handlePDF = () => exportPDF({
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className={`badge capitalize ${STATUS_COLORS[r.category] ?? 'bg-slate-100 text-slate-600'}`}>{r.category}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.count.toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(r.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                        <div className="h-1.5 rounded-full" style={{ width: `${r.pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      </div>
                      <span className="text-slate-600 text-xs w-10 text-right">{r.pct.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.hours > 0 ? `${r.hours.toFixed(1)}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700">Total</td>
                <td className="px-4 py-3 text-slate-600">{totalItems.toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatCurrency(total)}</td>
                <td className="px-4 py-3 text-slate-500">100%</td>
                <td className="px-4 py-3 text-slate-500">{data.reduce((s,r)=>s+r.hours,0).toFixed(1)}h</td>
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

  const handlePDF = () => exportPDF({
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((m, i) => {
                const { label, cls } = ageBucket(m.oldestDays)
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[240px]">
                      <p className="truncate">{m.name}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.number || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{m.oldestDays}d</td>
                    <td className="px-4 py-3"><span className={`badge text-xs ${cls}`}>{label}</span></td>
                    <td className="px-4 py-3 text-slate-600">{m.count}</td>
                    <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{formatCurrency(m.total)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-slate-700" colSpan={4}>Total</td>
                <td className="px-4 py-3">{data.reduce((s,m)=>s+m.count,0)}</td>
                <td className="px-4 py-3 text-red-600 whitespace-nowrap">{formatCurrency(totalOutstanding)}</td>
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

  const handlePDF = () => exportPDF({
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {headers.map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((r, i) => {
                const reductionPct = r.totalDemanded > 0
                  ? Math.round((r.savings / r.totalDemanded) * 100)
                  : null
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px]">
                      <p className="truncate">{r.matterName}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.matterNumber || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.settlementDate}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'final' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatCurrency(r.totalDemanded)}</td>
                    <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(r.totalReserve)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{formatCurrency(r.totalSettled)}</td>
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap ${r.savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {r.savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(r.savings))}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {reductionPct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-1.5">
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
                <td colSpan={4} className="px-4 py-3 text-slate-700">Total ({totals.count} matters)</td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatCurrency(totals.demanded)}</td>
                <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(totals.reserved)}</td>
                <td className="px-4 py-3 text-slate-800 whitespace-nowrap">{formatCurrency(totals.settled)}</td>
                <td className={`px-4 py-3 whitespace-nowrap ${totals.savings >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {totals.savings >= 0 ? '' : '−'}{formatCurrency(Math.abs(totals.savings))}
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{savingsPct}% avg reduction</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [tab,    setTab]    = useState('outstanding')
  const [preset, setPreset] = useState(2)

  const dateFrom = useMemo(() => {
    const days = DATE_PRESETS[preset].days
    return days ? subDays(new Date(), days).toISOString() : null
  }, [preset])

  const { data: obligations = [], isLoading: obLoading } = useQuery({
    queryKey: ['report-obligations', dateFrom],
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

  const { data: lineItems = [], isLoading: liLoading } = useQuery({
    queryKey: ['report-line-items', dateFrom],
    enabled:  tab === 'categories',
    queryFn: async () => {
      let q = supabase
        .from('la_invoice_line_items')
        .select('id, amount, category, hours, date_of_service')
      if (dateFrom) q = q.gte('date_of_service', dateFrom.split('T')[0])
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

  const isLoading = obLoading || (tab === 'categories' && liLoading) || (tab === 'settlements' && settlementLoading)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 self-start sm:self-auto">
          {DATE_PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => setPreset(i)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                preset === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-colors whitespace-nowrap ${
                tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="card p-16 text-center">
          <div className="h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading report data…</p>
        </div>
      ) : (
        <>
          {tab === 'outstanding' && <OutstandingReport    data={outstandingByInsurer}  dateLabel={DATE_PRESETS[preset].label} />}
          {tab === 'velocity'    && <VelocityReport      data={velocityByInsurer}     dateLabel={DATE_PRESETS[preset].label} />}
          {tab === 'categories'  && <CategoriesReport    data={categoryBreakdown}     dateLabel={DATE_PRESETS[preset].label} />}
          {tab === 'aging'       && <AgingReport         data={matterAging}           dateLabel={DATE_PRESETS[preset].label} />}
          {tab === 'settlements' && <SettlementReport    data={settlementComparison} />}
        </>
      )}
    </div>
  )
}
