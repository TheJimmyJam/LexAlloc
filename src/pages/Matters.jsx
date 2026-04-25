import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { db } from '../lib/mockDb.js'
import { useForm } from 'react-hook-form'
import { Plus, Search, FolderOpen, X, ChevronRight, FileText, Calculator } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  active:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  closed:  'bg-slate-100 text-slate-500',
  pending: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
}

function Modal({ onClose, profile, onCreated }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()
  const onSubmit = (v) => {
    const m = db.insert('matters', { org_id: profile.org_id, name: v.name, matter_number: v.matter_number, description: v.description, status: 'active', created_by: profile.id })
    toast.success('Matter created!')
    onCreated(m)
    onClose()
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-lg">New Matter</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Matter Name *</label>
            <input className="form-input" placeholder="Smith v. Acme Corporation"
              {...register('name', { required: true })} />
          </div>
          <div>
            <label className="form-label">Matter Number</label>
            <input className="form-input" placeholder="2024-001" {...register('matter_number')} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input h-24 resize-none" {...register('description')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center">Create Matter</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Matters() {
  const { profile } = useAuth()
  const [matters, setMatters] = useState([])
  const [search, setSearch]   = useState('')
  const [showModal, setShowModal] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') // 'invoices' | 'apportionments' | null

  const load = () => setMatters(db.getMatterWithCounts(profile?.org_id))
  useEffect(() => { if (profile) load() }, [profile])

  const filtered = matters.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.matter_number||'').toLowerCase().includes(search.toLowerCase())
    if (!matchesSearch) return false
    if (activeTab === 'invoices')       return (m.invoices?.[0]?.count ?? 0) > 0
    if (activeTab === 'apportionments') return (m.invoices?.[0]?.count ?? 0) > 0 // matters with activity
    return true
  })

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Matters</h1>
          <p className="text-slate-500 text-sm mt-0.5">{matters.length} matter{matters.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> New Matter</button>
      </div>

      {activeTab === 'invoices' && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span>Showing matters with invoices.</span>
          <button onClick={() => setSearchParams({})} className="ml-auto text-blue-500 hover:text-blue-700 font-medium flex items-center gap-1">
            <X className="h-3 w-3" /> Clear filter
          </button>
        </div>
      )}
      {activeTab === 'apportionments' && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-700 text-sm">
          <Calculator className="h-4 w-4 flex-shrink-0" />
          <span>Showing matters with apportionment activity.</span>
          <button onClick={() => setSearchParams({})} className="ml-auto text-purple-500 hover:text-purple-700 font-medium flex items-center gap-1">
            <X className="h-3 w-3" /> Clear filter
          </button>
        </div>
      )}

      <div className="relative mb-6">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input className="form-input pl-9 max-w-sm" placeholder="Search matters…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No matters found</p>
            {!search && <button onClick={() => setShowModal(true)} className="btn-primary mt-4"><Plus className="h-4 w-4" /> Create Matter</button>}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {['Matter','Number','Parties','Invoices','Status','Created',''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-4">
                    <Link to={`/matters/${m.id}`} className="font-medium text-slate-800 hover:text-brand-600">{m.name}</Link>
                    {m.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{m.description}</p>}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.matter_number || '—'}</td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.parties?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.invoices?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-4"><span className={`badge ${STATUS_COLORS[m.status]||'bg-slate-100 text-slate-500'}`}>{m.status}</span></td>
                  <td className="px-4 py-4 text-sm text-slate-400">{format(parseISO(m.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-4"><Link to={`/matters/${m.id}`} className="text-slate-400 hover:text-brand-600"><ChevronRight className="h-4 w-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <Modal onClose={() => setShowModal(false)} profile={profile} onCreated={load} />}
    </div>
  )
}
