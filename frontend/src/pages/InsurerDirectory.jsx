import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { useForm } from 'react-hook-form'
import {
  Plus, Search, X, Edit2, Trash2, Building2, Phone, Mail,
  MapPin, User, ChevronRight, BookOpen
} from 'lucide-react'
import toast from 'react-hot-toast'

// ── Add / Edit Insurer Modal ──────────────────────────────────────────────────
function InsurerFormModal({ insurer = null, onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const isEdit = !!insurer

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: insurer ? {
      name:             insurer.name,
      policy_number:    insurer.policy_number  || '',
      contact_email:    insurer.contact_email  || '',
      billing_address:  insurer.billing_address || '',
      claims_rep_name:  insurer.claims_rep_name || '',
      claims_rep_phone: insurer.claims_rep_phone || '',
    } : {}
  })

  const onSubmit = async (values) => {
    const payload = {
      name:             values.name,
      policy_number:    values.policy_number    || null,
      contact_email:    values.contact_email    || null,
      billing_address:  values.billing_address  || null,
      claims_rep_name:  values.claims_rep_name  || null,
      claims_rep_phone: values.claims_rep_phone || null,
    }

    let error
    if (isEdit) {
      ;({ error } = await supabase.from('la_insurers').update(payload).eq('id', insurer.id))
    } else {
      ;({ error } = await supabase.from('la_insurers').insert({ ...payload, org_id: profile.org_id }))
    }

    if (error) { toast.error(error.message); return }
    toast.success(isEdit ? 'Insurer updated!' : 'Insurer added to directory!')
    qc.invalidateQueries({ queryKey: ['insurer-directory', profile.org_id] })
    qc.invalidateQueries({ queryKey: ['org-insurers'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg">{isEdit ? 'Edit Insurer' : 'Add Insurer'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Saved to your org's insurer directory</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Carrier Info */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Carrier</p>
            <div>
              <label className="form-label">Insurer Name *</label>
              <input className="form-input" placeholder="Travelers Indemnity Company"
                {...register('name', { required: 'Name is required' })} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="form-label">Default Policy Number</label>
              <input className="form-input" placeholder="GL-2019-001234"
                {...register('policy_number')} />
              <p className="text-xs text-slate-400 mt-1">Can be overridden per matter</p>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Claims Rep */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Claims Contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Claims Rep Name</label>
                <input className="form-input" placeholder="Jane Smith"
                  {...register('claims_rep_name')} />
              </div>
              <div>
                <label className="form-label">Claims Rep Phone</label>
                <input className="form-input" placeholder="xxx.xxx.xxxx"
                  {...register('claims_rep_phone')} />
              </div>
            </div>
            <div>
              <label className="form-label">Claims / Billing Email</label>
              <input type="email" className="form-input" placeholder="claims@insurer.com"
                {...register('contact_email')} />
            </div>
            <div>
              <label className="form-label">Billing Address</label>
              <textarea className="form-input h-20 resize-none"
                placeholder={'123 Main St\nSuite 400\nHartford, CT 06101'}
                {...register('billing_address')} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Insurer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function InsurerDirectory() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  const { data: insurers = [], isLoading } = useQuery({
    queryKey: ['insurer-directory', profile?.org_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurers')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name')
      return data || []
    },
    enabled: !!profile?.org_id,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return insurers
    return insurers.filter(ins =>
      ins.name.toLowerCase().includes(q) ||
      (ins.claims_rep_name || '').toLowerCase().includes(q) ||
      (ins.contact_email   || '').toLowerCase().includes(q)
    )
  }, [insurers, search])

  const deleteInsurer = async (ins) => {
    if (!confirm(`Remove "${ins.name}" from the directory? This won't affect existing matter policy periods.`)) return
    const { error } = await supabase.from('la_insurers').delete().eq('id', ins.id)
    if (error) { toast.error(error.message); return }
    toast.success(`${ins.name} removed`)
    qc.invalidateQueries({ queryKey: ['insurer-directory', profile.org_id] })
    qc.invalidateQueries({ queryKey: ['org-insurers'] })
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <h1 className="text-xl font-bold text-slate-900">Insurer Directory</h1>
          </div>
          <p className="text-sm text-slate-500">
            Reusable insurer contacts for your org — select one when adding an insurer to a matter to auto-fill their info.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex-shrink-0">
          <Plus className="h-4 w-4" /> Add Insurer
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          className="form-input pl-9"
          placeholder="Search by name, rep, or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-400">Loading…</div>
        ) : insurers.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-600 mb-1">No insurers yet</p>
            <p className="text-sm text-slate-400 mb-5">
              Add your first insurer to build a reusable contact book for this org.
            </p>
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Add First Insurer
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-400">No insurers match "{search}"</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Insurer</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Claims Rep</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Contact</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3 hidden xl:table-cell">Billing Address</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(ins => (
                <tr key={ins.id} className="hover:bg-slate-50 group">
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{ins.name}</p>
                    {ins.policy_number && (
                      <p className="text-xs text-slate-400 mt-0.5">Policy: {ins.policy_number}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    {ins.claims_rep_name ? (
                      <div>
                        <p className="text-sm text-slate-700 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                          {ins.claims_rep_name}
                        </p>
                        {ins.claims_rep_phone && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            {ins.claims_rep_phone}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 hidden lg:table-cell">
                    {ins.contact_email ? (
                      <a href={`mailto:${ins.contact_email}`}
                        className="text-sm text-brand-600 hover:underline flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        {ins.contact_email}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 hidden xl:table-cell">
                    {ins.billing_address ? (
                      <p className="text-xs text-slate-500 whitespace-pre-line flex gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                        {ins.billing_address}
                      </p>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(ins)}
                        className="text-slate-400 hover:text-brand-600 transition-colors p-1 rounded hover:bg-brand-50"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteInsurer(ins)}
                        className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
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
        )}
      </div>

      {/* Count */}
      {insurers.length > 0 && (
        <p className="text-xs text-slate-400 mt-3 text-right">
          {filtered.length === insurers.length
            ? `${insurers.length} insurer${insurers.length !== 1 ? 's' : ''} in directory`
            : `${filtered.length} of ${insurers.length} shown`}
        </p>
      )}

      {/* Modals */}
      {showAdd  && <InsurerFormModal onClose={() => setShowAdd(false)} />}
      {editing  && <InsurerFormModal insurer={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
