import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../lib/mockDb.js'
import { useForm } from 'react-hook-form'
import { formatCurrency } from '../lib/calculations.js'
import { ArrowLeft, Plus, Trash2, X, Upload, FileText, Users, Shield, Calculator, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import InvoiceUploadModal from '../components/InvoiceUploadModal.jsx'

const TABS = [
  { key:'overview', label:'Overview', icon:FileText },
  { key:'parties',  label:'Parties',  icon:Users },
  { key:'insurers', label:'Insurers', icon:Shield },
  { key:'invoices', label:'Invoices', icon:Upload },
  { key:'apportionments', label:'Apportionments', icon:Calculator },
]

const STATUS_COLORS = { draft:'bg-slate-100 text-slate-500', parsed:'bg-blue-100 text-blue-700', apportioned:'bg-purple-100 text-purple-700', active:'bg-green-100 text-green-700' }

function PartyModal({ matterId, profile, onClose, onSaved }) {
  const { register, handleSubmit } = useForm()
  const onSubmit = (v) => {
    db.insert('parties', { matter_id:matterId, org_id:profile.org_id, name:v.name, type:v.type, share_percentage:parseFloat(v.share_percentage)||0, notes:v.notes })
    toast.success('Party added!')
    onSaved(); onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-semibold text-lg">Add Party</h2><button onClick={onClose}><X className="h-5 w-5 text-slate-400"/></button></div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div><label className="form-label">Party Name *</label><input className="form-input" placeholder="Acme Corporation" {...register('name',{required:true})} /></div>
          <div><label className="form-label">Type</label><select className="form-input" {...register('type')}><option value="defendant">Defendant</option><option value="plaintiff">Plaintiff</option><option value="third_party">Third Party</option><option value="cross_defendant">Cross-Defendant</option></select></div>
          <div><label className="form-label">Share Percentage (%)</label><input type="number" step="0.01" min="0" max="100" className="form-input" placeholder="50.00" {...register('share_percentage',{required:true})} /></div>
          <div><label className="form-label">Notes</label><textarea className="form-input h-20 resize-none" {...register('notes')} /></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Add Party</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function InsurerModal({ matterId, profile, parties, onClose, onSaved }) {
  const { register, handleSubmit } = useForm()
  const onSubmit = (v) => {
    // find or create insurer
    let ins = db.getAll('insurers', { org_id: profile.org_id }).find(i => i.name === v.insurer_name)
    if (!ins) ins = db.insert('insurers', { org_id:profile.org_id, name:v.insurer_name, policy_number:v.policy_number })
    db.insert('insurer_policy_periods', {
      insurer_id: ins.id, party_id: v.party_id, matter_id: matterId, org_id: profile.org_id,
      policy_start: v.policy_start, policy_end: v.policy_end,
      policy_limit: v.policy_limit ? parseFloat(v.policy_limit) : null,
      deductible:   v.deductible   ? parseFloat(v.deductible)   : null,
      insurers: { name: v.insurer_name, policy_number: v.policy_number },
      parties:  { name: parties.find(p=>p.id===v.party_id)?.name || '' },
    })
    toast.success('Insurer added!')
    onSaved(); onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b"><h2 className="font-semibold text-lg">Add Insurer & Policy Period</h2><button onClick={onClose}><X className="h-5 w-5 text-slate-400"/></button></div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div><label className="form-label">Insurer Name *</label><input className="form-input" placeholder="Travelers Indemnity" {...register('insurer_name',{required:true})} /></div>
          <div><label className="form-label">Policy Number</label><input className="form-input" placeholder="GL-2019-001234" {...register('policy_number')} /></div>
          <div><label className="form-label">Insured Party *</label><select className="form-input" {...register('party_id',{required:true})}><option value="">Select party…</option>{parties.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="form-label">Policy Start *</label><input type="date" className="form-input" {...register('policy_start',{required:true})} /></div>
            <div><label className="form-label">Policy End *</label><input type="date" className="form-input" {...register('policy_end',{required:true})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="form-label">Policy Limit ($)</label><input type="number" step="0.01" className="form-input" placeholder="1,000,000" {...register('policy_limit')} /></div>
            <div><label className="form-label">Deductible ($)</label><input type="number" step="0.01" className="form-input" placeholder="10,000" {...register('deductible')} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Add Insurer</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function MatterDetail() {
  const { matterId } = useParams()
  const { profile }  = useAuth()
  const [tab, setTab] = useState('overview')
  const [matter, setMatter]       = useState(null)
  const [parties, setParties]     = useState([])
  const [insurers, setInsurers]   = useState([])
  const [invoices, setInvoices]   = useState([])
  const [apports, setApports]     = useState([])
  const [showParty,   setShowParty]   = useState(false)
  const [showInsurer, setShowInsurer] = useState(false)
  const [showUpload,  setShowUpload]  = useState(false)

  const reload = () => {
    setMatter(db.getOne('matters', matterId))
    setParties(db.getAll('parties', { matter_id: matterId }))
    setInsurers(db.getPolicyPeriodsWithJoins(matterId))
    setInvoices(db.getAll('invoices', { matter_id: matterId }))
    setApports(db.getApportionmentsWithJoins(matterId))
  }
  useEffect(() => { reload() }, [matterId])

  if (!matter) return <div className="p-8 text-center text-slate-400">Loading…</div>

  const totalPct = parties.reduce((s,p) => s + (p.share_percentage||0), 0)

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link to="/matters" className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3"><ArrowLeft className="h-3 w-3"/> All Matters</Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{matter.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{matter.matter_number && <span className="mr-3">#{matter.matter_number}</span>}{matter.description}</p>
          </div>
          <span className={`badge ${STATUS_COLORS[matter.status]||'bg-slate-100 text-slate-500'} text-sm px-3 py-1`}>{matter.status}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(({key,label,icon:Icon}) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab===key?'border-brand-600 text-brand-600':'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon className="h-4 w-4"/>{label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[['Parties',parties.length,'brand-600'],['Policy Periods',insurers.length,'blue-500'],['Invoices',invoices.length,'purple-500'],['Total Invoiced',formatCurrency(invoices.reduce((s,i)=>s+(i.total_amount||0),0)),'green-500']].map(([label,value,c])=>(
            <div key={label} className="card p-5 text-center">
              <p className={`text-3xl font-bold text-${c}`}>{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Parties */}
      {tab === 'parties' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Parties</h2>
              {totalPct !== 100 && parties.length > 0 && <p className="text-xs text-amber-600 mt-0.5">⚠ Shares total {totalPct}% — must equal 100%</p>}
            </div>
            <button onClick={() => setShowParty(true)} className="btn-primary"><Plus className="h-4 w-4"/> Add Party</button>
          </div>
          <div className="card overflow-hidden">
            {parties.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><Users className="h-8 w-8 mx-auto mb-2 text-slate-300"/><p>No parties yet.</p><button onClick={() => setShowParty(true)} className="btn-primary mt-4"><Plus className="h-4 w-4"/> Add Party</button></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50">{['Name','Type','Share %','Notes',''].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {parties.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-4"><span className="badge bg-slate-100 text-slate-600 capitalize">{p.type?.replace('_',' ')}</span></td>
                      <td className="px-4 py-4 font-semibold text-slate-800">{p.share_percentage}%</td>
                      <td className="px-4 py-4 text-sm text-slate-400 max-w-xs truncate">{p.notes||'—'}</td>
                      <td className="px-4 py-4"><button onClick={() => { db.delete('parties',p.id); reload(); toast.success('Removed') }} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4"/></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50"><td colSpan={2} className="px-4 py-3 font-semibold text-slate-700 text-sm">Total</td><td className={`px-4 py-3 font-bold text-sm ${totalPct===100?'text-green-600':'text-amber-600'}`}>{totalPct}%</td><td colSpan={2}/></tr></tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Insurers */}
      {tab === 'insurers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Insurers & Policy Periods</h2>
            <button onClick={() => setShowInsurer(true)} className="btn-primary" disabled={parties.length===0}><Plus className="h-4 w-4"/> Add Insurer</button>
          </div>
          {parties.length===0 && <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-amber-700 text-sm">Add parties first before adding insurers.</div>}
          <div className="card overflow-hidden">
            {insurers.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><Shield className="h-8 w-8 mx-auto mb-2 text-slate-300"/><p>No insurers added yet.</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50">{['Insurer','Policy #','Party','Policy Period','Limit',''].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {insurers.map(pp => (
                    <tr key={pp.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-800">{pp.insurers?.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-500 font-mono">{pp.insurers?.policy_number||'—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{pp.parties?.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{format(parseISO(pp.policy_start),'MM/dd/yyyy')} — {format(parseISO(pp.policy_end),'MM/dd/yyyy')}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{pp.policy_limit ? formatCurrency(pp.policy_limit) : '—'}</td>
                      <td className="px-4 py-4"><button onClick={() => { db.delete('insurer_policy_periods',pp.id); reload(); toast.success('Removed') }} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Invoices */}
      {tab === 'invoices' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Invoices</h2>
            <button onClick={() => setShowUpload(true)} className="btn-primary"><Upload className="h-4 w-4"/> Upload Invoice</button>
          </div>
          <div className="card overflow-hidden">
            {invoices.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><FileText className="h-8 w-8 mx-auto mb-2 text-slate-300"/><p>No invoices yet.</p><button onClick={() => setShowUpload(true)} className="btn-primary mt-4"><Upload className="h-4 w-4"/> Upload First Invoice</button></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50">{['Invoice #','Billing Firm','Date','Amount','Status',''].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-800">{inv.invoice_number||'Draft'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{inv.billing_firm||'—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{inv.invoice_date ? format(parseISO(inv.invoice_date),'MM/dd/yyyy') : '—'}</td>
                      <td className="px-4 py-4 font-semibold text-slate-800">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-4 py-4"><span className={`badge ${STATUS_COLORS[inv.status]||'bg-slate-100 text-slate-500'}`}>{inv.status}</span></td>
                      <td className="px-4 py-4"><Link to={`/matters/${matterId}/invoices/${inv.id}`} className="text-slate-400 hover:text-brand-600"><ChevronRight className="h-4 w-4"/></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Apportionments */}
      {tab === 'apportionments' && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-4">Apportionments</h2>
          <div className="card overflow-hidden">
            {apports.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><Calculator className="h-8 w-8 mx-auto mb-2 text-slate-300"/><p>No apportionments yet.</p><p className="text-xs mt-1">Open an invoice and click "Run Apportionment".</p></div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-slate-100 bg-slate-50">{['Invoice','Total','Method','Calculated',''].map(h=><th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {apports.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-medium text-slate-800">{a.invoices?.invoice_number||'Invoice'}</td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(a.invoices?.total_amount)}</td>
                      <td className="px-4 py-4 text-sm text-slate-500 capitalize">{a.calculation_method?.replace(/_/g,' ')}</td>
                      <td className="px-4 py-4 text-sm text-slate-400">{a.calculated_at ? format(parseISO(a.calculated_at),'MM/dd/yyyy HH:mm') : '—'}</td>
                      <td className="px-4 py-4"><Link to={`/matters/${matterId}/apportionments/${a.id}`} className="text-slate-400 hover:text-brand-600"><ChevronRight className="h-4 w-4"/></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showParty   && <PartyModal   matterId={matterId} profile={profile} onClose={() => setShowParty(false)}   onSaved={reload} />}
      {showInsurer && <InsurerModal matterId={matterId} profile={profile} parties={parties} onClose={() => setShowInsurer(false)} onSaved={reload} />}
      {showUpload  && <InvoiceUploadModal matterId={matterId} profile={profile} onClose={() => { setShowUpload(false); reload() }} />}
    </div>
  )
}
