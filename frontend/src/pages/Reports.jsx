import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { differenceInDays, parseISO, subDays, format } from 'date-fns'
import {
  AlertTriangle, Clock, Layers, TrendingUp, Download, BarChart3,
} from 'lucide-react'
import { formatCurrency } from '../lib/calculations.js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// ── Constants ─────────────────────────────────────────────────────────────────
const DATE_PRESETS = [
  { label: 'Last 30 days',   days: 30  },
  { label: 'Last 90 days',   days: 90  },
  { label: 'Last 12 months', days: 365 },
  { label: 'All time',       days: null },
]

const CHART_COLORS = [
  '#7c3aed','#2563eb','#16a34a','#d97706',
  '#dc2626','#0891b2','#9333ea','#ea580c','#0d9488','#be185d',
]

const STATUS_COLORS = {
  pending:        'bg-amber-100 text-amber-700',
  demanded:       'bg-red-100 text-red-700',
  disputed:       'bg-orange-100 text-orange-700',
  partially_paid: 'bg-blue-100 text-blue-700',
  paid:           'bg-green-100 text-green-700',
}

const TABS = [
  { key: 'outstanding', label: 'Outstanding Obligations', icon: AlertTriangle },
  { key: 'velocity',    label: 'Payment Velocity',        icon: Clock         },
  { key: 'categories',  label: 'Invoice Categories',      icon: Layers        },
  { key: 'aging',       label: 'Matter Aging',            icon: TrendingUp    },
]

// ── CSV export helper ─────────────────────────────────────────────────────────
function exportCSV(filename, headers, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: filename,
  })
  a.click()
}

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'text-slate-900' }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Section header with export button ────────────────────────────────────────
function SectionHeader({ title, onExport, exportLabel = 'Export CSV' }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <button
        onClick={onExport}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-brand-600 border border-slate-200 hover:border-brand-300 px-3 py-1.5 rounded-lg transition-colors"
      >
        <Download className="h-3.5 w-3.5" /> {exportLabel}
      </button>
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
    name: r.name.replace('[DEMO] ', '').slice(0, 20),
    outstanding: parseFloat((r.total - r.paid).toFixed(2)),
  }))

  const handleExport = () => exportCSV(
    `outstanding-obligations-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    ['Insurer', 'Obligations', 'Total Obligated', 'Amount Paid', 'Outstanding', 'Demanded', 'Disputed', 'Pending'],
    data.map(r => [
      r.name, r.count,
      (r.total).toFixed(2),
      (r.paid).toFixed(2),
      (r.total - r.paid).toFixed(2),
      r.demanded.toFixed(2),
      r.disputed.toFixed(2),
      r.pending.toFixed(2),
    ])
  )

  if (data.length === 0) return (
    <div className="card p-12 text-center text-slate-400">
      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p>No outstanding obligations found for {dateLabel}.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Outstanding"  value={formatCurrency(totals.outstanding)} color="text-red-600" />
        <KpiCard label="Demanded"           value={formatCurrency(totals.demanded)}    color="text-orange-600" />
        <KpiCard label="Active Obligations" value={totals.obligations.toLocaleString()} />
        <KpiCard label="Carriers Owing"     value={totals.insurers.toLocaleString()} />
      </div>

      {/* Bar chart */}
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

      {/* Table */}
      <div className="card overflow-hidden">
        <SectionHeader title="Detail by Carrier" onExport={handleExport} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {['Insurer / Carrier','Obligations','Total Obligated','Amount Paid','Outstanding','Demanded','Pending'].map(h => (
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
                  <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(r.pending)}</td>
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
                <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{formatCurrency(data.reduce((s,r)=>s+r.pending,0))}</td>
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
    if (data.length === 0) return null
    const totalCount = data.reduce((s, r) => s + r.count, 0)
    const totalDays  = data.reduce((s, r) => s + r.totalDays, 0)
    const fastest    = [...data].sort((a, b) => a.avg - b.avg)[0]
    const slowest    = [...data].sort((a, b) => b.avg - a.avg)[0]
    return {
      avg:     Math.round(totalDays / totalCount),
      count:   totalCount,
      fastest: fastest?.name,
      slowest: slowest?.name,
    }
  }, [data])

  const chartData = data.map(r => ({
    name: r.name.replace('[DEMO] ', '').slice(0, 20),
    avg:  r.avg,
    min:  r.min,
    max:  r.max,
  }))

  const handleExport = () => exportCSV(
    `payment-velocity-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    ['Insurer', 'Payments Received', 'Avg Days (Demand→Payment)', 'Fastest (days)', 'Slowest (days)', 'Total Collected'],
    data.map(r => [r.name, r.count, r.avg, r.min, r.max, r.totalAmount.toFixed(2)])
  )

  if (data.length === 0) return (
    <div className="card p-12 text-center text-slate-400">
      <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No payment velocity data for {dateLabel}.</p>
      <p className="text-xs">Velocity is calculated from obligations with both a demand date and a confirmed payment date.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Avg Days to Pay"   value={`${overall?.avg ?? '—'} days`} sub="Demand → receipt" color="text-brand-700" />
        <KpiCard label="Payments Tracked"  value={overall?.count?.toLocaleString() ?? '—'} />
        <KpiCard label="Fastest Carrier"   value={overall?.fastest ?? '—'} color="text-green-600" />
        <KpiCard label="Slowest Carrier"   value={overall?.slowest ?? '—'} color="text-red-600" />
      </div>

      {/* Bar chart — avg days */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Average Days Demand → Payment by Carrier</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
            <YAxis tickFormatter={v => `${v}d`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [`${v} days`, name === 'avg' ? 'Avg' : name === 'min' ? 'Fastest' : 'Slowest']} />
            <Bar dataKey="min" name="Fastest" fill="#16a34a" radius={[3,3,0,0]} />
            <Bar dataKey="avg" name="Avg"     fill="#7c3aed" radius={[3,3,0,0]} />
            <Bar dataKey="max" name="Slowest" fill="#dc2626" radius={[3,3,0,0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <SectionHeader title="Velocity Detail by Carrier" onExport={handleExport} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {['Insurer / Carrier','Payments','Avg Days','Fastest','Slowest','Total Collected'].map(h => (
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
        <p className="text-xs text-slate-400 px-4 pb-3 pt-2">
          Velocity only calculated for obligations with both a demand date and a confirmed payment date recorded.
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Report 3 — Invoice Category Breakdown
// ═══════════════════════════════════════════════════════════════════════════════
function CategoriesReport({ data, dateLabel }) {
  const total = data.reduce((s, r) => s + r.total, 0)
  const totalItems = data.reduce((s, r) => s + r.count, 0)
  const top = data[0]

  const handleExport = () => exportCSV(
    `invoice-categories-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    ['Category', 'Line Items', 'Total Amount', '% of Total', 'Total Hours'],
    data.map(r => [r.category, r.count, r.total.toFixed(2), r.pct.toFixed(1)+'%', r.hours > 0 ? r.hours.toFixed(1) : ''])
  )

  if (data.length === 0) return (
    <div className="card p-12 text-center text-slate-400">
      <Layers className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p>No invoice line item data found for {dateLabel}.</p>
    </div>
  )

  const pieData = data.map(r => ({ name: r.category, value: r.total }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Billed"    value={formatCurrency(total)} color="text-brand-700" />
        <KpiCard label="Line Items"      value={totalItems.toLocaleString()} />
        <KpiCard label="Top Category"    value={top?.category ?? '—'} sub={top ? formatCurrency(top.total) : ''} />
        <KpiCard label="Categories"      value={data.length.toLocaleString()} />
      </div>

      {/* Chart + table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">Billing by Category</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, pct }) => `${name} ${(pct*100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-slate-700 mb-2">Amount by Category</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data.map(r => ({ name: r.category, amount: r.total }))}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 80, bottom: 4 }}
            >
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

      {/* Table */}
      <div className="card overflow-hidden">
        <SectionHeader title="Category Detail" onExport={handleExport} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {['Category','Line Items','Total Amount','% of Total','Total Hours'].map(h => (
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

  const ageBucket = (days) => {
    if (days >= 365) return { label: '365+ days', cls: 'bg-red-100 text-red-700' }
    if (days >= 180) return { label: '180–365 days', cls: 'bg-orange-100 text-orange-700' }
    return { label: '90–180 days', cls: 'bg-amber-100 text-amber-700' }
  }

  const chartData = Object.entries(buckets).map(([label, items]) => ({
    label,
    count:       items.length,
    outstanding: items.reduce((s, m) => s + m.total, 0),
  }))

  const handleExport = () => exportCSV(
    `matter-aging-${format(new Date(), 'yyyy-MM-dd')}.csv`,
    ['Matter Name', 'Matter Number', 'Days Outstanding', 'Age Bucket', 'Outstanding Obligations', 'Total Outstanding'],
    data.map(m => [
      m.name, m.number ?? '', m.oldestDays,
      ageBucket(m.oldestDays).label,
      m.count, m.total.toFixed(2),
    ])
  )

  if (data.length === 0) return (
    <div className="card p-12 text-center text-slate-400">
      <TrendingUp className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="mb-1">No matters with obligations outstanding 90+ days.</p>
      <p className="text-xs">This report shows matters where at least one obligation has been demanded but not paid for 90 or more days.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Matters 90+ Days"   value={data.length}                                color="text-amber-600" />
        <KpiCard label="Matters 180+ Days"  value={buckets['180–365 days'].length + buckets['365+ days'].length} color="text-orange-600" />
        <KpiCard label="Matters 365+ Days"  value={buckets['365+ days'].length}                color="text-red-600" />
        <KpiCard label="Total Outstanding"  value={formatCurrency(totalOutstanding)}            color="text-red-600" />
      </div>

      {/* Aging bar chart */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-slate-700 mb-4">Matters by Age Bucket</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 16, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left"  orientation="left"  tickFormatter={v => v}              tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tickFormatter={v => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, name) => name === 'count' ? [`${v} matters`, 'Count'] : [formatCurrency(v), 'Outstanding']} />
            <Bar yAxisId="left"  dataKey="count"       name="count"       fill="#f59e0b" radius={[4,4,0,0]} />
            <Bar yAxisId="right" dataKey="outstanding" name="outstanding" fill="#dc2626" radius={[4,4,0,0]} />
            <Legend />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Aging table */}
      <div className="card overflow-hidden">
        <SectionHeader title={`${data.length} matters with obligations 90+ days outstanding`} onExport={handleExport} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {['Matter','Number','Days Outstanding','Age','Obligations','Total Outstanding'].map(h => (
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
                    <td className="px-4 py-3">
                      <span className={`badge text-xs ${cls}`}>{label}</span>
                    </td>
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
        <p className="text-xs text-slate-400 px-4 pb-3 pt-2">
          Days outstanding measured from demand date (or obligation creation date if not yet demanded).
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Reports Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  const [tab,    setTab]    = useState('outstanding')
  const [preset, setPreset] = useState(2) // default: last 12 months

  const dateFrom = useMemo(() => {
    const days = DATE_PRESETS[preset].days
    return days ? subDays(new Date(), days).toISOString() : null
  }, [preset])

  // Obligations query — feeds outstanding, velocity, and aging tabs
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

  // Line items query — feeds categories tab (lazy: only when tab is active)
  const { data: lineItems = [], isLoading: liLoading } = useQuery({
    queryKey: ['report-line-items', dateFrom],
    enabled: tab === 'categories',
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

  // ── Derived report data ──────────────────────────────────────────────────────

  // Report 1: Outstanding obligations grouped by insurer
  const outstandingByInsurer = useMemo(() => {
    const map = {}
    obligations
      .filter(o => o.payment_status !== 'paid')
      .forEach(o => {
        const name = o.la_insurers?.name || 'Unknown Insurer'
        const id   = o.la_insurers?.id   || 'unknown'
        if (!map[id]) map[id] = { name, count: 0, total: 0, paid: 0, pending: 0, demanded: 0, disputed: 0 }
        map[id].count++
        map[id].total += Number(o.amount      || 0)
        map[id].paid  += Number(o.amount_paid || 0)
        const bal = Number(o.amount || 0) - Number(o.amount_paid || 0)
        if      (o.payment_status === 'demanded')  map[id].demanded += bal
        else if (o.payment_status === 'disputed')  map[id].disputed += bal
        else                                        map[id].pending  += bal
      })
    return Object.values(map).sort((a, b) => (b.total - b.paid) - (a.total - a.paid))
  }, [obligations])

  // Report 2: Payment velocity by insurer
  const velocityByInsurer = useMemo(() => {
    const map = {}
    obligations
      .filter(o => o.payment_status === 'paid' && o.demanded_at && o.payment_date)
      .forEach(o => {
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

  // Report 3: Invoice category breakdown
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

  // Report 4: Matter aging (obligations 90+ days outstanding)
  const matterAging = useMemo(() => {
    const map = {}
    obligations
      .filter(o => o.payment_status !== 'paid')
      .forEach(o => {
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

  const isLoading = obLoading || (tab === 'categories' && liLoading)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page header */}
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

        {/* Date range pills */}
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.label.split(' ')[0]}</span>
            </button>
          )
        })}
      </div>

      {/* Report content */}
      {isLoading ? (
        <div className="card p-16 text-center">
          <div className="h-8 w-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading report data…</p>
        </div>
      ) : (
        <>
          {tab === 'outstanding' && (
            <OutstandingReport data={outstandingByInsurer} dateLabel={DATE_PRESETS[preset].label} />
          )}
          {tab === 'velocity' && (
            <VelocityReport data={velocityByInsurer} dateLabel={DATE_PRESETS[preset].label} />
          )}
          {tab === 'categories' && (
            <CategoriesReport data={categoryBreakdown} dateLabel={DATE_PRESETS[preset].label} />
          )}
          {tab === 'aging' && (
            <AgingReport data={matterAging} dateLabel={DATE_PRESETS[preset].label} />
          )}
        </>
      )}
    </div>
  )
}
