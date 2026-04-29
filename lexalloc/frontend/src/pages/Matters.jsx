import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { useForm } from 'react-hook-form'
import { Plus, Search, FolderOpen, X, ChevronRight, Filter, Upload, Copy, LayoutTemplate, Trash2, Download, FileText } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import InvoiceUploadModal from '../components/InvoiceUploadModal.jsx'
import ImportMatterModal from '../components/ImportMatterModal.jsx'
import BulkCreateMattersModal from '../components/BulkCreateMattersModal.jsx'
import { logAudit } from '../lib/audit.js'

// ── Create / New Template Modal ───────────────────────────────────────────────
function CreateMatterModal({ isTemplate = false, onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm()
  const [addingFirm, setAddingFirm] = useState(false)
  const [newFirmName, setNewFirmName] = useState('')
  const [savingFirm, setSavingFirm] = useState(false)

  const { data: firms = [], refetch: refetchFirms } = useQuery({
    queryKey: ['firms', profile?.org_id],
    enabled: !!profile?.org_id && !isTemplate,
    queryFn: async () => {
      const { data } = await supabase.from('la_firms').select('id, name').eq('org_id', profile.org_id).order('name')
      return data || []
    },
  })

  const firmIdWatch = watch('firm_id')

  const handleFirmChange = (e) => {
    const val = e.target.value
    setValue('firm_id', val)
    if (val === '__new__') {
      setAddingFirm(true)
      setNewFirmName('')
    } else {
      setAddingFirm(false)
    }
  }

  const handleSaveNewFirm = async () => {
    if (!newFirmName.trim()) return
    setSavingFirm(true)
    const { data: newFirm, error } = await supabase.from('la_firms')
      .insert({ org_id: profile.org_id, name: newFirmName.trim() })
      .select().single()
    if (error) { toast.error(error.message); setSavingFirm(false); return }
    await refetchFirms()
    setValue('firm_id', newFirm.id)
    setAddingFirm(false)
    setNewFirmName('')
    setSavingFirm(false)
    toast.success(`Firm "${newFirm.name}" created!`)
  }

  const handleCancelNewFirm = () => {
    setAddingFirm(false)
    setNewFirmName('')
    setValue('firm_id', '')
  }

  const onSubmit = async (values) => {
    const selectedFirm = firms.find(f => f.id === values.firm_id)
    const { data: newMatter, error } = await supabase.from('la_matters').insert({
      org_id:        profile.org_id,
      name:          values.name,
      matter_number: values.matter_number || null,
      firm_id:       values.firm_id       || null,
      firm_name:     selectedFirm?.name   || null,
      description:   values.description  || null,
      status:        'active',
      created_by:    profile.id,
      is_template:   isTemplate,
    }).select().single()
    if (error) { toast.error(error.message); return }
    logAudit({ profile, matterId: newMatter?.id, action: 'matter.created', entityType: 'matter', entityId: newMatter?.id, entityName: values.name, metadata: { matter_number: values.matter_number || null, firm_name: selectedFirm?.name || null, is_template: isTemplate } })
    toast.success(isTemplate ? 'Template created!' : 'Matter created!')
    qc.invalidateQueries({ queryKey: ['matters'] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['dashboard-firms'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">
              {isTemplate ? 'New Template' : 'New Matter'}
            </h2>
            {isTemplate && (
              <p className="text-xs text-slate-400 mt-0.5">
                After creating, open the template to configure parties and insurer assignments.
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          {!isTemplate && (
            <div>
              <label className="form-label">Firm *</label>
              <select
                className={`form-input ${errors.firm_id ? 'border-red-400' : ''}`}
                {...register('firm_id', {
                  required: 'Firm is required',
                  validate: v => v !== '__new__' || 'Please save or cancel the new firm first',
                })}
                onChange={handleFirmChange}
              >
                <option value="">— Select a firm —</option>
                {firms.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="__new__">+ Add new firm…</option>
              </select>
              {errors.firm_id && <p className="text-red-500 text-xs mt-1">{errors.firm_id.message}</p>}
              {addingFirm && (
                <div className="mt-2 flex gap-2 items-center">
                  <input
                    className="form-input flex-1"
                    placeholder="New firm name…"
                    value={newFirmName}
                    onChange={e => setNewFirmName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleSaveNewFirm())}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewFirm}
                    disabled={!newFirmName.trim() || savingFirm}
                    className="btn-primary px-3 py-2 text-xs whitespace-nowrap"
                  >
                    {savingFirm ? 'Saving…' : 'Save Firm'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelNewFirm}
                    className="btn-secondary px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {!isTemplate && (
            <div>
              <label className="form-label">Matter Number</label>
              <input className="form-input" placeholder="2025-MDN-0047"
                {...register('matter_number')} />
            </div>
          )}
          <div>
            <label className="form-label">{isTemplate ? 'Template Name' : 'Matter Name'} *</label>
            <input className="form-input"
              placeholder={isTemplate ? 'e.g. Construction Defect — Multi-Carrier' : 'Holloway v. Meridian Industries — Employment Dispute'}
              {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Description</label>
            <textarea className="form-input h-24 resize-none"
              placeholder={isTemplate ? 'Describe what case type or scenario this template is for…' : 'Brief description of the matter…'}
              {...register('description')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : isTemplate ? 'Create Template' : 'Create Matter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Use Template Modal ────────────────────────────────────────────────────────
export function UseTemplateModal({ template, onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: '', matter_number: '', firm_name: '' }
  })

  const onSubmit = async (values) => {
    try {
      // 1. Create the new matter
      const { data: newMatter, error: mErr } = await supabase
        .from('la_matters')
        .insert({
          org_id:        profile.org_id,
          name:          values.name,
          matter_number: values.matter_number || null,
          firm_name:     values.firm_name     || null,
          description:   template.description || null,
          status:        'active',
          created_by:    profile.id,
          is_template:   false,
        })
        .select()
        .single()
      if (mErr) throw mErr

      // 2. Fetch template parties
      const { data: tParties, error: pErr } = await supabase
        .from('la_parties')
        .select('*')
        .eq('matter_id', template.id)
      if (pErr) throw pErr

      // 3. Insert copies of parties, build old→new ID map
      const partyIdMap = {}
      if (tParties && tParties.length > 0) {
        for (const p of tParties) {
          const { data: newParty, error: npErr } = await supabase
            .from('la_parties')
            .insert({
              matter_id:        newMatter.id,
              org_id:           profile.org_id,
              name:             p.name,
              type:             p.type,
              share_percentage: p.share_percentage,
              notes:            p.notes || null,
            })
            .select()
            .single()
          if (npErr) throw npErr
          partyIdMap[p.id] = newParty.id
        }

        // 4. Fetch template insurer policy periods
        const { data: tPeriods, error: ppErr } = await supabase
          .from('la_insurer_policy_periods')
          .select('*')
          .eq('matter_id', template.id)
        if (ppErr) throw ppErr

        // 5. Insert copies — carry over insurer assignment, limits, deductible
        //    but NOT dates, claim numbers, or rep contact info (those are matter-specific)
        if (tPeriods && tPeriods.length > 0) {
          const periodInserts = tPeriods
            .filter(pp => partyIdMap[pp.party_id]) // only copy if party was copied
            .map(pp => ({
              insurer_id:   pp.insurer_id,
              party_id:     partyIdMap[pp.party_id],
              matter_id:    newMatter.id,
              org_id:       profile.org_id,
              policy_limit: pp.policy_limit || null,
              deductible:   pp.deductible   || null,
            }))
          if (periodInserts.length > 0) {
            const { error: piErr } = await supabase.from('la_insurer_policy_periods').insert(periodInserts)
            if (piErr) throw piErr
          }
        }
      }

      toast.success('Matter created from template!')
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      navigate(`/matters/${newMatter.id}`)
    } catch (err) {
      toast.error(err.message || 'Failed to create matter from template')
    }
  }

  // Count parties/insurers in the template for the preview
  const partyCount    = template.la_parties?.[0]?.count  ?? 0
  const invoiceCount  = template.la_invoices?.[0]?.count ?? 0 // should always be 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900 text-lg">Create Matter from Template</h2>
            <p className="text-xs text-slate-400 mt-0.5">Using: <span className="font-medium text-slate-600">{template.name}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {/* Template summary */}
        <div className="mx-6 mt-5 rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 flex items-start gap-3">
          <LayoutTemplate className="h-4 w-4 text-violet-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-violet-700 space-y-0.5">
            {template.description && <p>{template.description}</p>}
            <p>
              <span className="font-semibold">{partyCount}</span> {partyCount === 1 ? 'party' : 'parties'} and their insurer assignments will be copied.
              Policy dates and claim details will be left blank for you to fill in.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Firm Name</label>
            <input className="form-input" placeholder="ABC Legal, LLP"
              {...register('firm_name')} />
          </div>
          <div>
            <label className="form-label">Matter Number</label>
            <input className="form-input" placeholder="2025-MDN-0047"
              {...register('matter_number')} />
          </div>
          <div>
            <label className="form-label">Matter Name *</label>
            <input className="form-input" placeholder="Holloway v. Meridian Industries — Employment Dispute"
              {...register('name', { required: 'Matter name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Matters() {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [view, setView] = useState('matters')          // 'matters' | 'templates'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showFromInvoice, setShowFromInvoice] = useState(false)
  const [uploadMatterId, setUploadMatterId] = useState(null)
  const [useTemplate, setUseTemplate] = useState(null) // template object
  const [deleteConfirm, setDeleteConfirm] = useState(null) // matter object to delete
  const [deleting, setDeleting] = useState(false)

  // Which PMS providers are connected (Clio via accounting, FileVine via pm_connections)
  const { data: availablePmsProviders = [] } = useQuery({
    queryKey: ['pms-providers', profile?.org_id],
    queryFn: async () => {
      const [{ data: acct }, { data: pm }] = await Promise.all([
        supabase.from('la_accounting_connections').select('provider').eq('org_id', profile.org_id).eq('is_active', true),
        supabase.from('la_pm_connections').select('provider').eq('org_id', profile.org_id).eq('is_active', true),
      ])
      const providers = []
      if ((acct ?? []).some(c => c.provider === 'clio'))      providers.push('clio')
      if ((pm   ?? []).some(c => c.provider === 'filevine'))  providers.push('filevine')
      return providers
    },
    enabled: !!profile?.org_id,
  })

  const { data: allMatters = [], isLoading } = useQuery({
    queryKey: ['matters', profile?.org_id],
    enabled: !!profile?.org_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matters')
        .select(`
          id, name, matter_number, status, created_at, description, is_template,
          la_invoices(count), la_parties(count)
        `)
        .eq('org_id', profile.org_id)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const matters   = allMatters.filter(m => !m.is_template)
  const templates = allMatters.filter(m =>  m.is_template)
  const list      = view === 'templates' ? templates : matters

  const filtered = list.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.matter_number || '').toLowerCase().includes(search.toLowerCase())
    const matchesStatus = view === 'templates' || statusFilter === 'all' || m.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusColors = {
    active:  'bg-green-100 text-green-700',
    closed:  'bg-slate-100 text-slate-600',
    pending: 'bg-yellow-100 text-yellow-700',
  }

  const handleDeleteMatter = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    const { error } = await supabase.from('la_matters').delete().eq('id', deleteConfirm.id)
    setDeleting(false)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['matters', profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    qc.invalidateQueries({ queryKey: ['recent-matters'] })
    toast.success(`"${deleteConfirm.name}" deleted`)
    setDeleteConfirm(null)
  }

  const quickUpdateStatus = async (matterId, status) => {
    const { error } = await supabase.from('la_matters').update({ status, updated_at: new Date().toISOString() }).eq('id', matterId)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['matters', profile?.org_id] })
    qc.invalidateQueries({ queryKey: ['recent-matters'] })
    toast.success(`Status updated to ${status}`)
  }

  const deleteTemplate = async (t) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('la_matters').delete().eq('id', t.id)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['matters', profile?.org_id] })
    toast.success('Template deleted')
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Matters</h1>
          <p className="text-slate-500 text-sm mt-1">
            {matters.length} matter{matters.length !== 1 ? 's' : ''}
            {templates.length > 0 && ` · ${templates.length} template${templates.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'matters' && availablePmsProviders.length > 0 && (
            <button onClick={() => setShowImport(true)} className="btn-secondary">
              <Download className="h-4 w-4" /> Import
            </button>
          )}
          {view === 'matters' && (
            <button onClick={() => setShowFromInvoice(true)} className="btn-secondary">
              <FileText className="h-4 w-4" /> From Invoice
            </button>
          )}
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            {view === 'templates' ? 'New Template' : 'New Matter'}
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-6">
        <button
          onClick={() => setView('matters')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === 'matters' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <FolderOpen className="h-4 w-4" /> Matters
        </button>
        <button
          onClick={() => setView('templates')}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            view === 'templates' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <LayoutTemplate className="h-4 w-4" /> Templates
          {templates.length > 0 && (
            <span className="bg-violet-100 text-violet-700 text-xs font-semibold px-1.5 py-0.5 rounded-full leading-none">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {/* Search + Filter (matters only) */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="form-input pl-9 w-full"
            placeholder={view === 'templates' ? 'Search templates…' : 'Search matters…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {view === 'matters' && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              className="form-input py-2 text-sm"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        )}
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
          <div className="p-8 text-center text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            {view === 'templates'
              ? <LayoutTemplate className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              : <FolderOpen className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            }
            <p className="text-slate-500 font-medium">
              {view === 'templates' ? 'No templates yet' : 'No matters found'}
            </p>
            <p className="text-slate-400 text-sm mt-1">
              {search
                ? 'Try a different search.'
                : view === 'templates'
                  ? 'Save a template to reuse party configurations across similar matters.'
                  : 'Create your first matter to get started.'}
            </p>
            {!search && (
              <button onClick={() => setShowModal(true)} className="btn-primary mt-4">
                <Plus className="h-4 w-4" />
                {view === 'templates' ? 'New Template' : 'Create Matter'}
              </button>
            )}
          </div>
        ) : view === 'templates' ? (
          /* ── Templates Table ── */
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-violet-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Template Name</th>
                <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Parties</th>
                <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Created</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/matters/${t.id}`)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="h-4 w-4 text-violet-400 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-slate-800">{t.name}</p>
                        {t.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{t.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-500">{t.la_parties?.[0]?.count ?? 0}</td>
                  <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-400">{format(parseISO(t.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setUseTemplate(t)}
                        className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Use Template
                      </button>
                      <button
                        onClick={() => deleteTemplate(t)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                        title="Delete template"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : (
          /* ── Matters Table ── */
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Matter</th>
                <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Number</th>
                <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Parties</th>
                <th className="hidden sm:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Invoices</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="hidden md:table-cell text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Created</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/matters/${m.id}`)}
                >
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-800">{m.name}</p>
                    {m.description && <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{m.description}</p>}
                  </td>
                  <td className="hidden md:table-cell px-4 py-4 text-sm text-slate-500">{m.matter_number || '—'}</td>
                  <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-500">{m.la_parties?.[0]?.count ?? 0}</td>
                  <td className="hidden sm:table-cell px-4 py-4 text-sm text-slate-500">{m.la_invoices?.[0]?.count ?? 0}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
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
                  <td className="hidden md:table-cell px-4 py-4 text-sm text-slate-400">{format(parseISO(m.created_at), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setUploadMatterId(m.id)}
                        className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                        title="Upload invoice for this matter"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Add Invoice
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(m)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete matter"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showModal && (
        <CreateMatterModal
          isTemplate={view === 'templates'}
          onClose={() => setShowModal(false)}
        />
      )}
      {uploadMatterId && (
        <InvoiceUploadModal
          matterId={uploadMatterId}
          onClose={() => {
            setUploadMatterId(null)
            qc.invalidateQueries({ queryKey: ['matters', profile?.org_id] })
          }}
        />
      )}
      {useTemplate && (
        <UseTemplateModal
          template={useTemplate}
          onClose={() => setUseTemplate(null)}
        />
      )}
      {showImport && (
        <ImportMatterModal
          availableProviders={availablePmsProviders}
          onClose={() => setShowImport(false)}
        />
      )}
      {showFromInvoice && (
        <BulkCreateMattersModal
          onClose={() => setShowFromInvoice(false)}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-slate-900 text-lg">Delete matter?</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    <span className="font-medium text-slate-700">"{deleteConfirm.name}"</span> and all its invoices, parties, insurers, and apportionments will be permanently deleted. This cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="btn-secondary flex-1 justify-center"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMatter}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors disabled:opacity-60"
              >
                {deleting
                  ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Deleting…</>
                  : <><Trash2 className="h-4 w-4" /> Delete Matter</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
