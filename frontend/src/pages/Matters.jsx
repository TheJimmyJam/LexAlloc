import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabase.js'
import { useForm } from 'react-hook-form'
import { Plus, Search, FolderOpen, X, ChevronRight, Filter } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'

function CreateMatterModal({ onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_matters').insert({
      org_id:        profile.org_id,
      name:          values.name,
      matter_number: values.matter_number,
      description:   values.description,
      status:        'active',
      created_by:    profile.id,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Matter created!')
    qc.invalidateQueries({ queryKey: ['matters'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900 text-lg">New Matter</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Matter Name *</label>
            <input className="form-input" placeholder="Smith v. Acme Corporation"
              {...register('name', { required: 'Matter name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Matter Number</label>
            <input className="form-input" placeholder="2024-001"
              {...register('matter_number')} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input h-24 resize-none" placeholder="Brief description of the matter…"
              {...register('description')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Matter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Matters() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)

  const { data: matters = [], isLoading } = useQuery({
    queryKey: ['matters', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matters')
        .select(`
          id, name, matter_number, status, created_at, description,
          invoices(count), parties(count)
        `)
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const filtered = matters.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.matter_number || '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusColors = {
    active:  'bg-green-100 text-green-700',
    closed:  'bg-slate-100 text-slate-600',
    pending: 'bg-yellow-100 text-yellow-700',
  }

  const quickUpdateStatus = async (matterId, status) => {
    const { error } = await supabase.from('la_matters').update({ status, updated_at: new Date().toISOString() }).eq('id', matterId)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['matters', profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['recent-matters'] })
    toast.success(`Status updated to ${status}`)
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Matters</h1>
          <p className="text-slate-500 text-sm mt-1">{matters.length} matter{matters.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New Matter
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="form-input pl-9 w-64"
            placeholder="Search matters…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            className="form-input py-2 text-sm w-36"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        {(search || statusFilter !== 'all') && (
          <button
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            onClick={() => { setSearch(''); setStatusFilter('all') }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading matters…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FolderOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No matters found</p>
            <p className="text-slate-400 text-sm mt-1">
              {search ? 'Try a different search.' : 'Create your first matter to get started.'}
            </p>
            {!search && (
              <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                <Plus className="h-4 w-4" /> Create Matter
              </button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Matter</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Number</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Parties</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Invoices</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Created</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link to={`/matters/${m.id}`} className="font-medium text-slate-800 hover:text-brand-600 transition-colors">
                      {m.name}
                    </Link>
                    {m.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{m.description}</p>}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.matter_number || '—'}</td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.parties?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-4 text-sm text-slate-500">{m.invoices?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-4">
                    <select
                      value={m.status}
                      onChange={e => quickUpdateStatus(m.id, e.target.value)}
                      className={`badge border-0 cursor-pointer text-xs font-medium rounded-full px-2.5 py-1 ${statusColors[m.status] || 'bg-slate-100 text-slate-500'}`}
                    >
                      <option value="active">active</option>
                      <option value="pending">pending</option>
                      <option value="closed">closed</option>
                    </select>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-400">{format(parseISO(m.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-4">
                    <Link to={`/matters/${m.id}`} className="text-slate-400 hover:text-brand-600 transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <CreateMatterModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
