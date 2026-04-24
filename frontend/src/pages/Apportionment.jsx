import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase.js'
import { formatCurrency, formatPercent } from '../lib/calculations.js'
import { ArrowLeft, Printer, Download, ChevronDown, ChevronRight, Shield, Users, Calendar, DollarSign } from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

const COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0d9488']

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

export default function Apportionment() {
  const { matterId, apportionmentId } = useParams()

  const { data: apport, isLoading } = useQuery({
    queryKey: ['apportionment', apportionmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('apportionments')
        .select(`
          *,
          invoices(invoice_number, total_amount, invoice_date, billing_firm, service_start, service_end),
          matters(name, matter_number),
          party_apportionments(
            id, percentage, amount,
            parties(name, type),
            insurer_apportionments(
              id, days_on_risk, total_days, percentage, amount,
              insurers(name, policy_number),
              insurer_policy_periods(policy_start, policy_end, policy_limit, deductible)
            )
          )
        `)
        .eq('id', apportionmentId)
        .single()
      return data
    }
  })

  const handlePrint = () => window.print()

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading apportionment…</div>
  if (!apport)   return <div className="p-8 text-center text-slate-400">Apportionment not found.</div>

  const result   = apport.result_json || {}
  const invoice  = apport.invoices || {}
  const partyApps = apport.party_apportionments || []

  // Chart data
  const pieData = partyApps.map((pa, i) => ({
    name:  pa.parties?.name || 'Unknown',
    value: pa.amount,
    color: COLORS[i % COLORS.length],
  }))

  const allInsurers = partyApps.flatMap(pa =>
    (pa.insurer_apportionments || []).map(ia => ({
      name:   `${pa.parties?.name} / ${ia.insurers?.name}`,
      amount: ia.amount,
    }))
  )

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto print:p-4">
      {/* Header */}
      <div className="mb-6 print:mb-4">
        <Link to={`/matters/${matterId}`}
          className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3 print:hidden">
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
          <div className="flex gap-3 print:hidden">
            <button onClick={handlePrint} className="btn-secondary"><Printer className="h-4 w-4" /> Print / PDF</button>
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:hidden">
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Party Apportionment</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                dataKey="value" nameKey="name" paddingAngle={2}>
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Insurer Obligations</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={allInsurers} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="amount" fill="#4f46e5" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-6">
        {/* Party-level breakdown */}
        <SectionCard title="Party Apportionment Summary" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Party</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Type</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Share %</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Amount</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Insurers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {partyApps.map((pa) => (
                  <tr key={pa.id}>
                    <td className="py-3 font-semibold text-slate-800">{pa.parties?.name}</td>
                    <td className="py-3">
                      <span className="badge bg-slate-100 text-slate-600 capitalize">
                        {pa.parties?.type?.replace('_',' ')}
                      </span>
                    </td>
                    <td className="py-3 text-right font-bold text-brand-700">{formatPercent(pa.percentage)}</td>
                    <td className="py-3 text-right font-bold text-slate-900">{formatCurrency(pa.amount)}</td>
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
            title={`${pa.parties?.name} — Insurer Time-on-Risk Breakdown`}
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
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Exposure Days</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">
                  {pa.insurer_apportionments?.[0]?.total_days || '—'}
                </p>
              </div>
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
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Policy Period</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Total Days</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">TOR %</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Obligation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pa.insurer_apportionments.map((ia) => {
                      const pp = ia.insurer_policy_periods
                      return (
                        <tr key={ia.id} className="hover:bg-slate-50">
                          <td className="py-3 font-medium text-slate-800">{ia.insurers?.name}</td>
                          <td className="py-3 text-sm font-mono text-slate-500">{ia.insurers?.policy_number || '—'}</td>
                          <td className="py-3 text-sm text-slate-600">
                            {pp ? (
                              <div>
                                <span>{format(parseISO(pp.policy_start), 'MM/dd/yyyy')}</span>
                                <span className="text-slate-400"> – </span>
                                <span>{format(parseISO(pp.policy_end), 'MM/dd/yyyy')}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td className="py-3 text-right font-semibold text-slate-800">{ia.days_on_risk}</td>
                          <td className="py-3 text-right text-slate-500">{ia.total_days}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-slate-100 rounded-full h-1.5">
                                <div className="bg-brand-600 h-1.5 rounded-full" style={{ width: `${Math.min(ia.percentage, 100)}%` }} />
                              </div>
                              <span className="font-bold text-brand-700 min-w-14 text-right">{formatPercent(ia.percentage)}</span>
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
                      <td className="pt-3 text-right font-bold text-brand-700">
                        {formatPercent(pa.insurer_apportionments.reduce((s, ia) => s + (ia.percentage || 0), 0))}
                      </td>
                      <td className="pt-3 text-right font-bold text-brand-700">
                        {formatCurrency(pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount || 0), 0))}
                      </td>
                    </tr>
                    {pa.amount - pa.insurer_apportionments.reduce((s, ia) => s + (ia.amount || 0), 0) > 0.01 && (
                      <tr className="bg-amber-50">
                        <td colSpan={6} className="pt-2 pb-3 text-amber-700 text-sm font-medium">
                          ⚠ Uninsured / Gap (no triggering policy)
                        </td>
                        <td className="pt-2 pb-3 text-right font-bold text-amber-700">
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
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">Days on Risk</th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-2">TOR %</th>
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
                      <td className="py-2.5 text-right text-sm text-slate-600">{ia.days_on_risk}</td>
                      <td className="py-2.5 text-right text-sm text-brand-600 font-medium">{formatPercent(ia.percentage)}</td>
                      <td className="py-2.5 text-right text-sm text-slate-500">{formatPercent(pa.percentage)}</td>
                      <td className="py-2.5 text-right font-bold text-slate-900">{formatCurrency(ia.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50">
                  <td colSpan={5} className="pt-3 font-bold text-slate-900">Invoice Total</td>
                  <td className="pt-3 text-right font-bold text-brand-700 text-xl">{formatCurrency(invoice.total_amount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          .card { box-shadow: none; border: 1px solid #e2e8f0; }
          body { font-size: 11px; }
        }
      `}</style>
    </div>
  )
}
