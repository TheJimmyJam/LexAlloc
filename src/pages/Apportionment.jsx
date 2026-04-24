import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { db } from '../lib/mockDb.js'
import { formatCurrency, formatPercent } from '../lib/calculations.js'
import { ArrowLeft, Printer, Shield, Users, DollarSign, ChevronDown, ChevronRight, Calendar } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488']

function Section({ title, icon: Icon, children, open: defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button onClick={() => setOpen(o=>!o)} className="flex items-center justify-between w-full p-5 border-b border-slate-100 text-left">
        <div className="flex items-center gap-2"><Icon className="h-4 w-4 text-brand-600"/><span className="font-semibold text-slate-900">{title}</span></div>
        {open ? <ChevronDown className="h-4 w-4 text-slate-400"/> : <ChevronRight className="h-4 w-4 text-slate-400"/>}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

export default function Apportionment() {
  const { matterId, apportionmentId } = useParams()
  const [apport, setApport] = useState(null)

  useEffect(() => {
    const a = db.getFullApportionment(apportionmentId)
    setApport(a)
  }, [apportionmentId])

  if (!apport) return <div className="p-8 text-center text-slate-400">Loading apportionment…</div>

  const invoice  = apport.invoices || {}
  const partyApps = apport.party_apportionments || []

  // Party-level pie (for bar chart source)
  const partyPieData = partyApps.map((pa, i) => ({
    name: pa.parties?.name || 'Unknown',
    value: pa.amount,
    color: COLORS[i % COLORS.length],
  }))

  // Insurer-level pie — each carrier gets its own slice
  const insurerPieData = partyApps.flatMap((pa, pi) =>
    (pa.insurer_apportionments || [])
      .filter(ia => ia.amount > 0)
      .map((ia, ii) => ({
        name: ia.insurers?.name || 'Unknown',
        party: pa.parties?.name,
        value: ia.amount,
        pct: invoice.total_amount > 0 ? (ia.amount / invoice.total_amount) * 100 : 0,
        color: COLORS[(pi * 4 + ii) % COLORS.length],
      }))
  )

  // Custom label rendered inside each slice
  const RADIAN = Math.PI / 180
  const renderSliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null  // skip tiny slices
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 12, fontWeight: '700', pointerEvents: 'none' }}>
        {`${(percent * 100).toFixed(1)}%`}
      </text>
    )
  }

  const allInsurers = partyApps.flatMap(pa =>
    (pa.insurer_apportionments || []).map(ia => ({
      name: ia.insurers?.name?.split(' ')[0] || 'Insurer',
      party: pa.parties?.name?.split(' ')[0],
      amount: ia.amount,
    }))
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto print:p-4">
      {/* Header */}
      <div className="mb-6 print:mb-4">
        <Link to={`/matters/${matterId}`} className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3 print:hidden">
          <ArrowLeft className="h-3 w-3"/> {apport.matters?.name}
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge bg-purple-100 text-purple-700 text-xs">Apportionment Report</span>
              <span className="badge bg-brand-100 text-brand-700 text-xs">Pro-Rata Time-on-Risk</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{invoice.invoice_number} — {apport.matters?.name}</h1>
            <p className="text-slate-500 text-sm mt-1">Calculated {apport.calculated_at ? format(parseISO(apport.calculated_at),'MMMM d, yyyy h:mm a') : ''}</p>
          </div>
          <button onClick={() => window.print()} className="btn-secondary print:hidden"><Printer className="h-4 w-4"/> Print / Save PDF</button>
        </div>
      </div>

      {/* Banner */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl p-6 mb-6 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['Invoice Total', formatCurrency(invoice.total_amount)],
            ['Billing Firm',  invoice.billing_firm || '—'],
            ['Service Period', `${invoice.service_start ? format(parseISO(invoice.service_start),'MM/dd/yy') : '?'} – ${invoice.service_end ? format(parseISO(invoice.service_end),'MM/dd/yy') : '?'}`],
            ['Parties', partyApps.length],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-brand-200 text-xs uppercase tracking-wide font-medium">{label}</p>
              <p className="text-xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:hidden">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-1">Insurer Apportionment</h3>
          <p className="text-xs text-slate-400 mb-4">Each carrier's share of total invoice</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <Pie
                data={insurerPieData}
                cx="42%"
                cy="50%"
                innerRadius={55}
                outerRadius={100}
                dataKey="value"
                nameKey="name"
                paddingAngle={2}
                labelLine={false}
                label={renderSliceLabel}
              >
                {insurerPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip
                formatter={(v, name, props) => [
                  `${formatCurrency(v)}  (${props.payload?.pct?.toFixed(1)}%)`,
                  props.payload?.party ? `${name} — ${props.payload.party}` : name
                ]}
              />
              <Legend
                layout="vertical"
                verticalAlign="middle"
                align="right"
                iconType="circle"
                iconSize={9}
                formatter={(value, entry) => (
                  <span style={{ fontSize: '11px', color: '#475569', lineHeight: '1.6' }}>
                    {value}<br />
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>{entry.payload?.party}</span>
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Insurer Obligations</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={allInsurers} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                formatter={v => formatCurrency(v)}
                labelFormatter={(l, p) => p[0]?.payload ? `${p[0].payload.party} / ${l}` : l}
              />
              <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-6">
        {/* Summary table */}
        <Section title="Party Apportionment Summary" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100">{['Party','Type','Share %','Amount','Carriers'].map(h=><th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 ${h==='Share %'||h==='Amount'||h==='Carriers'?'text-right':'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.map(pa => (
                  <tr key={pa.id}>
                    <td className="py-3 font-semibold text-slate-800">{pa.parties?.name}</td>
                    <td className="py-3"><span className="badge bg-slate-100 text-slate-600 capitalize">{pa.parties?.type?.replace('_',' ')}</span></td>
                    <td className="py-3 text-right font-bold text-brand-700">{formatPercent(pa.percentage)}</td>
                    <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(pa.amount)}</td>
                    <td className="py-3 text-right text-sm text-slate-500">{pa.insurer_apportionments?.filter(ia=>ia.days_on_risk>0).length||0} triggered</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-200"><td colSpan={3} className="pt-3 font-bold text-slate-900">Total</td><td className="pt-3 text-right font-bold text-brand-700 text-lg">{formatCurrency(partyApps.reduce((s,pa)=>s+(pa.amount||0),0))}</td><td/></tr></tfoot>
            </table>
          </div>
        </Section>

        {/* Per-party insurer breakdowns */}
        {partyApps.map(pa => (
          <Section key={pa.id} title={`${pa.parties?.name} — Insurer Time-on-Risk Breakdown`} icon={Shield}>
            <div className="flex flex-wrap gap-4 mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
              {[
                ['Party Share', formatPercent(pa.percentage)],
                ['Party Obligation', formatCurrency(pa.amount)],
                ['Service Period', `${invoice.service_start ? format(parseISO(invoice.service_start),'MM/dd/yyyy'):'?'} – ${invoice.service_end ? format(parseISO(invoice.service_end),'MM/dd/yyyy'):'?'}`],
                ['Exposure Days', pa.insurer_apportionments?.[0]?.total_days || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">{label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {(!pa.insurer_apportionments || pa.insurer_apportionments.length === 0) ? (
              <div className="text-center text-slate-400 py-4 text-sm">No insurer policy periods configured for this party. Full obligation remains with {pa.parties?.name}.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Insurer','Policy #','Policy Period','Days on Risk','Total Days','TOR %','Obligation'].map(h => (
                        <th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 ${['Days on Risk','Total Days','TOR %','Obligation'].includes(h)?'text-right':'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pa.insurer_apportionments.map(ia => {
                      const pp = ia.insurer_policy_periods
                      return (
                        <tr key={ia.id} className={`hover:bg-slate-50 ${ia.days_on_risk === 0 ? 'opacity-50' : ''}`}>
                          <td className="py-3 font-medium text-slate-800">{ia.insurers?.name}</td>
                          <td className="py-3 text-sm font-mono text-slate-500">{ia.insurers?.policy_number||'—'}</td>
                          <td className="py-3 text-sm text-slate-600">
                            {pp ? `${format(parseISO(pp.policy_start),'MM/dd/yyyy')} – ${format(parseISO(pp.policy_end),'MM/dd/yyyy')}` : '—'}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-800">{ia.days_on_risk}</td>
                          <td className="py-3 text-right text-slate-500">{ia.total_days}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                <div className="bg-brand-600 h-1.5 rounded-full" style={{ width:`${Math.min(ia.percentage,100)}%` }}/>
                              </div>
                              <span className="font-bold text-brand-700 min-w-[3.5rem] text-right">{formatPercent(ia.percentage)}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={5} className="pt-3 font-semibold text-slate-700 text-sm">Insured Subtotal</td>
                      <td className="pt-3 text-right font-bold text-brand-700">{formatPercent(pa.insurer_apportionments.reduce((s,ia)=>s+(ia.percentage||0),0))}</td>
                      <td className="pt-3 text-right font-bold text-brand-700">{formatCurrency(pa.insurer_apportionments.reduce((s,ia)=>s+(ia.amount||0),0))}</td>
                    </tr>
                    {pa.amount - pa.insurer_apportionments.reduce((s,ia)=>s+(ia.amount||0),0) > 0.01 && (
                      <tr className="bg-amber-50">
                        <td colSpan={6} className="pt-2 pb-3 text-amber-700 text-sm font-medium">⚠ Uninsured / Gap</td>
                        <td className="pt-2 pb-3 text-right font-bold text-amber-700">{formatCurrency(pa.amount - pa.insurer_apportionments.reduce((s,ia)=>s+(ia.amount||0),0))}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </Section>
        ))}

        {/* Grand summary */}
        <Section title="Grand Summary — All Parties & Insurers" icon={DollarSign}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-slate-100">{['Party','Insurer','Days on Risk','TOR %','Party %','Net Obligation'].map(h=><th key={h} className={`text-xs font-semibold text-slate-500 uppercase tracking-wide py-2 ${['Days on Risk','TOR %','Party %','Net Obligation'].includes(h)?'text-right':'text-left'}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.flatMap(pa =>
                  (pa.insurer_apportionments||[]).filter(ia=>ia.days_on_risk>0).map(ia => (
                    <tr key={`${pa.id}-${ia.id}`} className="hover:bg-slate-50">
                      <td className="py-2.5 font-medium text-slate-800 text-sm">{pa.parties?.name}</td>
                      <td className="py-2.5 text-sm text-slate-600">{ia.insurers?.name}</td>
                      <td className="py-2.5 text-right text-sm text-slate-600">{ia.days_on_risk}</td>
                      <td className="py-2.5 text-right text-sm text-brand-600 font-medium">{formatPercent(ia.percentage)}</td>
                      <td className="py-2.5 text-right text-sm text-slate-500">{formatPercent(pa.percentage)}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot><tr className="border-t-2 border-slate-300 bg-slate-50"><td colSpan={5} className="pt-3 font-bold text-slate-900">Invoice Total</td><td className="pt-3 text-right font-bold text-brand-700 text-xl">{formatCurrency(invoice.total_amount)}</td></tr></tfoot>
            </table>
          </div>
        </Section>
      </div>

      <style>{`@media print { .print\\:hidden{display:none!important} .card{box-shadow:none;border:1px solid #e2e8f0} body{font-size:11px} }`}</style>
    </div>
  )
}
