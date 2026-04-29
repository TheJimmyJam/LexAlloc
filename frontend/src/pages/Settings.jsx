import { useEffect, useState, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import {
  User, Lock, Building2, Shield, ShieldCheck, ShieldOff, QrCode,
  Loader2, CheckCircle2, X, Briefcase, Plus, Trash2, FolderOpen, Landmark,
  ChevronDown, ChevronRight, ExternalLink, Mail, Phone, MapPin, UserPlus, Pencil, Search,
  DollarSign, Globe,
} from 'lucide-react'

function fmtMoney(n) {
  if (!n) return null
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  admin:  'bg-brand-100 text-brand-700',
  user:   'bg-slate-100 text-slate-600',
  client: 'bg-blue-100 text-blue-700',
}

// ── Firm Edit Modal ───────────────────────────────────────────────────────────
function FirmEditModal({ orgId, firm, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!firm
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: isEdit ? {
      name:          firm.name,
      phone:         firm.phone         || '',
      email:         firm.email         || '',
      website:       firm.website       || '',
      address_line1: firm.address_line1 || '',
      address_line2: firm.address_line2 || '',
      city:          firm.city          || '',
      state:         firm.state         || '',
      zip:           firm.zip           || '',
      contact_name:  firm.contact_name  || '',
      contact_email: firm.contact_email || '',
    } : {}
  })

  const onSubmit = async (values) => {
    const payload = {
      name:          values.name.trim(),
      phone:         values.phone         || null,
      email:         values.email         || null,
      website:       values.website       || null,
      address_line1: values.address_line1 || null,
      address_line2: values.address_line2 || null,
      city:          values.city          || null,
      state:         values.state         || null,
      zip:           values.zip           || null,
      contact_name:  values.contact_name  || null,
      contact_email: values.contact_email || null,
    }
    let error
    if (isEdit) {
      ({ error } = await supabase.from('la_firms').update(payload).eq('id', firm.id))
    } else {
      ({ error } = await supabase.from('la_firms').insert({ ...payload, org_id: orgId }))
    }
    if (error) { toast.error(error.message); return }
    toast.success(isEdit ? 'Firm updated' : 'Firm added!')
    qc.invalidateQueries({ queryKey: ['firms', orgId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="font-semibold text-slate-900 text-lg">{isEdit ? `Edit — ${firm.name}` : 'Add Firm'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <form id="firm-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Firm Name */}
            <div>
              <label className="form-label">Firm Name *</label>
              <input className={`form-input ${errors.name ? 'border-red-400' : ''}`}
                placeholder="Smith & Associates LLP"
                {...register('name', { required: 'Firm name is required' })} />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" placeholder="xxx.xxx.xxxx" {...register('phone')} />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" className="form-input" placeholder="info@firm.com" {...register('email')} />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="form-label">Website</label>
                <input type="url" className="form-input" placeholder="https://firm.com" {...register('website')} />
              </div>
            </div>

            {/* Address */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Mailing Address</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <input className="form-input" placeholder="Address Line 1" {...register('address_line1')} />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <input className="form-input" placeholder="Address Line 2 (optional)" {...register('address_line2')} />
                </div>
                <div>
                  <input className="form-input" placeholder="CITY" {...register('city')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="form-input uppercase" placeholder="TX" maxLength={2}
                    {...register('state', { onChange: e => e.target.value = e.target.value.toUpperCase() })} />
                  <input className="form-input" placeholder="ZIP" {...register('zip')} />
                </div>
              </div>
            </div>

            {/* Primary contact */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Primary Contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Contact Name</label>
                  <input className="form-input" placeholder="Jane Smith" {...register('contact_name')} />
                </div>
                <div>
                  <label className="form-label">Contact Email</label>
                  <input type="email" className="form-input" placeholder="jsmith@firm.com" {...register('contact_email')} />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" form="firm-form" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Firm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Firms Tab ─────────────────────────────────────────────────────────────────
function FirmsTab({ orgId }) {
  const qc = useQueryClient()
  const [editModal, setEditModal] = useState(null) // null | 'new' | firm object

  const { data: firms = [], isLoading } = useQuery({
    queryKey: ['firms', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_firms')
        .select('*, la_matters(id, la_invoices(total_amount))')
        .eq('org_id', orgId)
        .order('name')
      return data || []
    },
  })

  const deleteFirm = async (e, firm) => {
    e.stopPropagation()
    const matterCount = firm.la_matters?.length || 0
    if (matterCount > 0) {
      toast.error(`Can't delete — ${matterCount} matter${matterCount > 1 ? 's' : ''} assigned. Reassign them first.`)
      return
    }
    if (!confirm(`Delete "${firm.name}"?`)) return
    const { error } = await supabase.from('la_firms').delete().eq('id', firm.id)
    if (error) { toast.error(error.message); return }
    toast.success('Firm deleted')
    qc.invalidateQueries({ queryKey: ['firms', orgId] })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">Law firms associated with your matters.</p>
        <button onClick={() => setEditModal('new')} className="btn-primary flex-shrink-0">
          <Plus className="h-4 w-4" /> Add Firm
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300 mx-auto" /></div>
      ) : firms.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Briefcase className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No firms yet</p>
          <button onClick={() => setEditModal('new')} className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> Add First Firm
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {firms.map(firm => {
            const matterCount = firm.la_matters?.length || 0
            const totalBilled = firm.la_matters?.reduce((sum, m) =>
              sum + (m.la_invoices?.reduce((s, inv) => s + (inv.total_amount || 0), 0) || 0), 0) || 0
            return (
              <button
                key={firm.id}
                onClick={() => setEditModal(firm)}
                className="text-left card p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-150 group"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
                    <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
                      {firm.name}
                    </p>
                  </div>
                  <button
                    onClick={e => deleteFirm(e, firm)}
                    className="p-1 rounded text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                    title="Delete firm"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>

                {/* Contact snippet */}
                <div className="space-y-1 mb-3">
                  {firm.contact_name && (
                    <p className="text-xs text-slate-600 flex items-center gap-1.5 truncate">
                      <User className="h-3 w-3 flex-shrink-0 text-slate-400" />{firm.contact_name}
                      {firm.contact_email && <span className="text-slate-400">· {firm.contact_email}</span>}
                    </p>
                  )}
                  {firm.phone && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />{firm.phone}
                    </p>
                  )}
                  {firm.email && !firm.contact_name && (
                    <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                      <Mail className="h-3 w-3 flex-shrink-0 text-slate-400" />{firm.email}
                    </p>
                  )}
                  {(firm.city || firm.state) && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 flex-shrink-0" />{[firm.city, firm.state].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {firm.website && (
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                      <Globe className="h-3 w-3 flex-shrink-0" />{firm.website.replace(/^https?:\/\//, '')}
                    </p>
                  )}
                </div>

                {/* Footer stats */}
                <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                  <span className="badge bg-slate-100 text-slate-600 text-xs flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" /> {matterCount} matter{matterCount !== 1 ? 's' : ''}
                  </span>
                  {totalBilled > 0 && (
                    <span className="badge bg-green-50 text-green-700 text-xs flex items-center gap-1">
                      <DollarSign className="h-3 w-3" /> {fmtMoney(totalBilled)} billed
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {editModal !== null && (
        <FirmEditModal
          orgId={orgId}
          firm={editModal === 'new' ? null : editModal}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  )
}

// ── Insurer Edit Modal (add + full edit + claims reps) ───────────────────────
function InsurerEditModal({ orgId, insurer, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!insurer
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: isEdit ? {
      name: insurer.name, contact_email: insurer.contact_email || '',
      phone: insurer.phone || '', website: insurer.website || '',
      payment_portal_url: insurer.payment_portal_url || '',
      address_line1: insurer.address_line1 || '', address_line2: insurer.address_line2 || '',
      city: insurer.city || '', state: insurer.state || '', zip: insurer.zip || '',
      notes: insurer.notes || '',
    } : {}
  })

  // Claims reps state
  const [reps, setReps]           = useState([])
  const [repForm, setRepForm]     = useState(null) // null | 'new' | rep object
  const [repName, setRepName]     = useState('')
  const [repEmail, setRepEmail]   = useState('')
  const [repPhone, setRepPhone]   = useState('')
  const [repTitle, setRepTitle]   = useState('')
  const [savingRep, setSavingRep] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    supabase.from('la_insurer_claims_reps')
      .select('*').eq('insurer_id', insurer.id).order('name')
      .then(({ data }) => setReps(data || []))
  }, [isEdit, insurer?.id])

  const openRepForm = (rep = null) => {
    setRepForm(rep || 'new')
    setRepName(rep?.name || '')
    setRepEmail(rep?.email || '')
    setRepPhone(rep?.phone || '')
    setRepTitle(rep?.title || '')
  }

  const saveRep = async () => {
    if (!repName.trim()) { toast.error('Rep name required'); return }
    setSavingRep(true)
    const payload = { name: repName.trim(), email: repEmail || null, phone: repPhone || null, title: repTitle || null }
    let err
    if (repForm === 'new') {
      const res = await supabase.from('la_insurer_claims_reps')
        .insert({ ...payload, org_id: orgId, insurer_id: insurer.id }).select().single()
      err = res.error
      if (!err) setReps(r => [...r, res.data])
    } else {
      const res = await supabase.from('la_insurer_claims_reps').update(payload).eq('id', repForm.id).select().single()
      err = res.error
      if (!err) setReps(r => r.map(x => x.id === repForm.id ? res.data : x))
    }
    setSavingRep(false)
    if (err) { toast.error(err.message); return }
    toast.success(repForm === 'new' ? 'Rep added' : 'Rep updated')
    setRepForm(null)
    qc.invalidateQueries({ queryKey: ['insurer-reps'] })
  }

  const deleteRep = async (rep) => {
    if (!confirm(`Remove ${rep.name}?`)) return
    const { error } = await supabase.from('la_insurer_claims_reps').delete().eq('id', rep.id)
    if (error) { toast.error(error.message); return }
    setReps(r => r.filter(x => x.id !== rep.id))
    toast.success('Rep removed')
  }

  const onSubmit = async (values) => {
    const payload = {
      name: values.name.trim(), contact_email: values.contact_email || null,
      phone: values.phone || null, website: values.website || null,
      payment_portal_url: values.payment_portal_url || null,
      address_line1: values.address_line1 || null, address_line2: values.address_line2 || null,
      city: values.city || null, state: values.state || null, zip: values.zip || null,
      notes: values.notes || null,
    }
    let error
    if (isEdit) {
      ({ error } = await supabase.from('la_insurers').update(payload).eq('id', insurer.id))
    } else {
      ({ error } = await supabase.from('la_insurers').insert({ ...payload, org_id: orgId }))
    }
    if (error) { toast.error(error.message); return }
    toast.success(isEdit ? 'Insurer updated' : 'Insurer added!')
    qc.invalidateQueries({ queryKey: ['insurers', orgId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="font-semibold text-slate-900 text-lg">{isEdit ? `Edit — ${insurer.name}` : 'Add Insurer'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {/* ── Core fields ── */}
          <form id="insurer-form" onSubmit={handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="form-label">Insurer Name *</label>
                <input className={`form-input ${errors.name ? 'border-red-400' : ''}`}
                  placeholder="Acme Insurance Co."
                  {...register('name', { required: 'Name is required' })} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="form-label">Contact Email</label>
                <input type="email" className="form-input" placeholder="claims@insurer.com"
                  {...register('contact_email')} />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" placeholder="xxx.xxx.xxxx"
                  {...register('phone')} />
              </div>
              <div>
                <label className="form-label">Website</label>
                <input type="url" className="form-input" placeholder="https://insurer.com"
                  {...register('website')} />
              </div>
              <div>
                <label className="form-label">Payment Portal URL</label>
                <input type="url" className="form-input" placeholder="https://payments.insurer.com"
                  {...register('payment_portal_url')} />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Mailing Address</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-1 sm:col-span-2">
                  <input className="form-input" placeholder="Address Line 1"
                    {...register('address_line1')} />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <input className="form-input" placeholder="Address Line 2 (optional)"
                    {...register('address_line2')} />
                </div>
                <div>
                  <input className="form-input" placeholder="CITY"
                    {...register('city')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="form-input uppercase" placeholder="TX" maxLength={2}
                    {...register('state', { onChange: e => e.target.value = e.target.value.toUpperCase() })} />
                  <input className="form-input" placeholder="ZIP"
                    {...register('zip')} />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} placeholder="Internal notes…"
                {...register('notes')} />
            </div>
          </form>

          {/* ── Claims Reps (only for existing insurers) ── */}
          {isEdit && (
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <UserPlus className="h-4 w-4 text-slate-400" /> Claims Representatives
                </p>
                <button onClick={() => openRepForm()} className="text-xs btn-secondary py-1 px-2">
                  <Plus className="h-3.5 w-3.5" /> Add Rep
                </button>
              </div>

              {reps.length === 0 && repForm === null && (
                <p className="text-sm text-slate-400 italic">No reps yet — click Add Rep to get started.</p>
              )}

              <div className="space-y-2">
                {reps.map(rep => (
                  <div key={rep.id} className="flex items-start justify-between bg-slate-50 rounded-lg px-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{rep.name}
                        {rep.title && <span className="ml-1.5 text-xs text-slate-400">· {rep.title}</span>}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {rep.email && <a href={`mailto:${rep.email}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Mail className="h-3 w-3" />{rep.email}</a>}
                        {rep.phone && <span className="text-xs text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" />{rep.phone}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                      <button onClick={() => openRepForm(rep)} className="p-1 text-slate-400 hover:text-brand-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteRep(rep)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Inline rep form */}
              {repForm !== null && (
                <div className="mt-3 bg-brand-50 border border-brand-200 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-brand-700">{repForm === 'new' ? 'New Rep' : `Edit — ${repForm.name}`}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-xs">Name *</label>
                      <input className="form-input" value={repName} onChange={e => setRepName(e.target.value)} placeholder="Jane Smith" />
                    </div>
                    <div>
                      <label className="form-label text-xs">Title</label>
                      <input className="form-input" value={repTitle} onChange={e => setRepTitle(e.target.value)} placeholder="Senior Claims Adjuster" />
                    </div>
                    <div>
                      <label className="form-label text-xs">Email</label>
                      <input type="email" className="form-input" value={repEmail} onChange={e => setRepEmail(e.target.value)} placeholder="jsmith@insurer.com" />
                    </div>
                    <div>
                      <label className="form-label text-xs">Phone</label>
                      <input className="form-input" value={repPhone} onChange={e => setRepPhone(e.target.value)} placeholder="xxx.xxx.xxxx" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setRepForm(null)} className="btn-secondary py-1 text-xs">Cancel</button>
                    <button onClick={saveRep} disabled={savingRep} className="btn-primary py-1 text-xs">
                      {savingRep ? 'Saving…' : 'Save Rep'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" form="insurer-form" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Insurer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Insurers Tab ──────────────────────────────────────────────────────────────
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function InsurersTab({ orgId }) {
  const qc = useQueryClient()
  const [editModal,  setEditModal]  = useState(null)  // null | 'new' | insurer object
  const [search,     setSearch]     = useState('')
  const sectionRefs = useRef({})

  const { data: insurers = [], isLoading } = useQuery({
    queryKey: ['insurers', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurers')
        .select('*, la_insurer_policy_periods(id), la_insurer_claims_reps(id)')
        .eq('org_id', orgId)
        .order('name')
      return data || []
    },
  })

  // Filter by search query
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? insurers.filter(i => i.name.toLowerCase().includes(q)) : insurers
  }, [insurers, search])

  // Group filtered insurers by first letter
  const grouped = useMemo(() => {
    const map = {}
    for (const ins of filtered) {
      const letter = ins.name[0]?.toUpperCase() || '#'
      if (!map[letter]) map[letter] = []
      map[letter].push(ins)
    }
    return map
  }, [filtered])

  const activeLetters = useMemo(() => new Set(Object.keys(grouped)), [grouped])

  const scrollToLetter = (letter) => {
    sectionRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const deleteInsurer = async (e, insurer) => {
    e.stopPropagation()
    const usageCount = insurer.la_insurer_policy_periods?.length || 0
    if (usageCount > 0) {
      toast.error(`Can't delete — assigned to ${usageCount} policy period${usageCount > 1 ? 's' : ''}. Remove those first.`)
      return
    }
    if (!confirm(`Delete "${insurer.name}"?`)) return
    const { error } = await supabase.from('la_insurers').delete().eq('id', insurer.id)
    if (error) { toast.error(error.message); return }
    toast.success('Insurer deleted')
    qc.invalidateQueries({ queryKey: ['insurers', orgId] })
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            className="form-input pl-9"
            placeholder="Search insurers…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button onClick={() => setEditModal('new')} className="btn-primary flex-shrink-0">
          <Plus className="h-4 w-4" /> Add Insurer
        </button>
      </div>

      {/* ── A–Z index strip ── */}
      <div className="flex overflow-x-auto gap-0.5 mb-5 pb-1">
        {ALPHABET.map(letter => (
          <button
            key={letter}
            onClick={() => scrollToLetter(letter)}
            disabled={!activeLetters.has(letter)}
            className={`flex-shrink-0 w-7 h-7 rounded text-xs font-semibold transition-colors ${
              activeLetters.has(letter)
                ? 'bg-brand-600 text-white hover:bg-brand-700'
                : 'bg-slate-100 text-slate-300 cursor-default'
            }`}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300 mx-auto" /></div>
      ) : insurers.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Landmark className="h-10 w-10 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No insurers yet</p>
          <button onClick={() => setEditModal('new')} className="btn-primary mt-4">
            <Plus className="h-4 w-4" /> Add First Insurer
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <p>No insurers match <strong className="text-slate-600">"{search}"</strong></p>
          <button onClick={() => setSearch('')} className="text-xs text-brand-600 hover:underline mt-2 block mx-auto">Clear search</button>
        </div>
      ) : (
        <div className="space-y-8">
          {ALPHABET.filter(l => grouped[l]).map(letter => (
            <div key={letter} ref={el => sectionRefs.current[letter] = el}>
              {/* Letter header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl font-extrabold text-slate-800 w-8 flex-shrink-0">{letter}</span>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{grouped[letter].length}</span>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grouped[letter].map(insurer => {
                  const repCount    = insurer.la_insurer_claims_reps?.length    || 0
                  const matterCount = insurer.la_insurer_policy_periods?.length || 0
                  return (
                    <button
                      key={insurer.id}
                      onClick={() => setEditModal(insurer)}
                      className="text-left card p-4 hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-150 group"
                    >
                      {/* Name row */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Landmark className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
                          <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors">
                            {insurer.name}
                          </p>
                        </div>
                        <button
                          onClick={e => deleteInsurer(e, insurer)}
                          className="p-1 rounded text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Delete"
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>

                      {/* Contact info */}
                      <div className="space-y-1 mb-3">
                        {insurer.contact_email && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                            <Mail className="h-3 w-3 flex-shrink-0 text-slate-400" />{insurer.contact_email}
                          </p>
                        )}
                        {insurer.phone && (
                          <p className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Phone className="h-3 w-3 flex-shrink-0 text-slate-400" />{insurer.phone}
                          </p>
                        )}
                        {(insurer.city || insurer.state) && (
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 flex-shrink-0" />{[insurer.city, insurer.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>

                      {/* Footer badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {repCount > 0 && (
                          <span className="badge bg-brand-50 text-brand-700 text-xs">
                            {repCount} rep{repCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {matterCount > 0 && (
                          <span className="badge bg-slate-100 text-slate-600 text-xs">
                            {matterCount} matter{matterCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {insurer.payment_portal_url && (
                          <span className="badge bg-green-50 text-green-700 text-xs flex items-center gap-1">
                            <ExternalLink className="h-2.5 w-2.5" /> Portal
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {editModal !== null && (
        <InsurerEditModal
          orgId={orgId}
          insurer={editModal === 'new' ? null : editModal}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  )
}

// ── Main Rolodex Page ─────────────────────────────────────────────────────────
const TABS = [
  { key: 'organization', label: 'Organization', icon: Building2  },
  { key: 'firms',        label: 'Firms',        icon: Briefcase  },
  { key: 'insurers',     label: 'Insurers',     icon: Landmark   },
]

export default function Settings() {
  const { profile, refetchProfile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [activeTab, setActiveTab] = useState('organization')

  const { register: regOrg, handleSubmit: handleOrgSubmit, reset: resetOrg, formState: { isSubmitting: isOrgSubmitting } } = useForm()

  useEffect(() => {
    if (profile) {
      resetOrg({ org_name: profile.la_organizations?.name || '' })
    }
  }, [profile])

  const onSaveOrg = async (values) => {
    const { error } = await supabase.from('la_organizations').update({ name: values.org_name }).eq('id', profile.org_id)
    if (error) { toast.error(error.message); return }
    toast.success('Organization name updated!')
    refetchProfile()
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Rolodex</h1>
        {profile?.role && (
          <span className={`badge text-xs font-semibold px-2.5 py-1 capitalize ${ROLE_COLORS[profile.role] || 'bg-slate-100 text-slate-500'}`}>
            <Shield className="h-3 w-3 inline mr-1" />{profile.role}
          </span>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-slate-200 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Organization Tab ── */}
      {activeTab === 'organization' && (
        <div className="card">
          <div className="flex items-center gap-2 p-5 border-b border-slate-100">
            <Building2 className="h-4 w-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Organization</h2>
          </div>
          {isAdmin ? (
            <form onSubmit={handleOrgSubmit(onSaveOrg)} className="p-5 space-y-4">
              <div>
                <label className="form-label">Organization Name <span className="text-brand-600 text-xs ml-1">(admin editable)</span></label>
                <input className="form-input" {...regOrg('org_name', { required: true })} />
              </div>
              <button type="submit" className="btn-primary" disabled={isOrgSubmitting}>
                {isOrgSubmitting ? 'Saving…' : 'Save Organization'}
              </button>
            </form>
          ) : (
            <div className="p-5">
              <label className="form-label">Organization Name</label>
              <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" value={profile?.la_organizations?.name || ''} disabled />
            </div>
          )}
        </div>
      )}

      {/* ── Firms Tab ── */}
      {activeTab === 'firms' && <FirmsTab orgId={profile?.org_id} />}

      {/* ── Insurers Tab ── */}
      {activeTab === 'insurers' && <InsurersTab orgId={profile?.org_id} />}

    </div>
  )
}
