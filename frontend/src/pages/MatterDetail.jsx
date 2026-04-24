import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import { useForm } from 'react-hook-form'
import { formatCurrency, exhaustionInfo } from '../lib/calculations.js'
import {
  ArrowLeft, Plus, Trash2, X, Upload, FileText,
  Users, Shield, Calculator, ChevronRight, Edit2, Check, TrendingUp, AlertTriangle,
  Paperclip, Download, ExternalLink, LayoutTemplate, Copy
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import toast from 'react-hot-toast'
import InvoiceUploadModal from '../components/InvoiceUploadModal.jsx'
import DocumentUploadModal, { DOC_TYPES } from '../components/DocumentUploadModal.jsx'
import { UseTemplateModal } from './Matters.jsx'

// ── Tabs ─────────────────────────────────────────────────────────────────────
const ALL_TABS = [
  { key: 'overview',      label: 'Overview',      icon: FileText,   templateOnly: false },
  { key: 'financials',    label: 'Financials',     icon: TrendingUp, templateOnly: false },
  { key: 'parties',       label: 'Parties',        icon: Users,      templateOnly: false },
  { key: 'insurers',      label: 'Insurers',       icon: Shield,     templateOnly: false },
  { key: 'invoices',      label: 'Invoices',       icon: Upload,     templateOnly: false },
  { key: 'apportionments',label: 'Apportionments', icon: Calculator, templateOnly: false },
  { key: 'documents',     label: 'Documents',      icon: Paperclip,  templateOnly: false },
]
// Tabs hidden when viewing a template (template has no invoices, apportionments, or financial data)
const TEMPLATE_HIDDEN_TABS = new Set(['financials', 'invoices', 'apportionments'])

const PAYMENT_STATUS_COLORS = {
  pending:       'bg-slate-100 text-slate-600',
  demanded:      'bg-amber-100 text-amber-700',
  paid:          'bg-green-100 text-green-700',
  partially_paid:'bg-blue-100 text-blue-700',
  disputed:      'bg-red-100 text-red-700',
}
const PAYMENT_STATUS_LABELS = {
  pending: 'Pending', demanded: 'Demanded', paid: 'Paid',
  partially_paid: 'Partial', disputed: 'Disputed',
}

// ── Edit Matter Modal ─────────────────────────────────────────────────────────
function EditMatterModal({ matter, onClose }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name:          matter.name,
      matter_number: matter.matter_number || '',
      description:   matter.description  || '',
      status:        matter.status,
    }
  })

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_matters').update({
      name:          values.name,
      matter_number: values.matter_number || null,
      description:   values.description  || null,
      status:        values.status,
      updated_at:    new Date().toISOString(),
    }).eq('id', matter.id)
    if (error) { toast.error(error.message); return }
    toast.success('Matter updated!')
    qc.invalidateQueries({ queryKey: ['matter', matter.id] })
    qc.invalidateQueries({ queryKey: ['matters'] })
    qc.invalidateQueries({ queryKey: ['recent-matters'] })
    onClose()
  }

  const handleDelete = async () => {
    if (!confirm(`Permanently delete "${matter.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('la_matters').delete().eq('id', matter.id)
    if (error) { toast.error(error.message); return }
    toast.success('Matter deleted')
    qc.invalidateQueries({ queryKey: ['matters'] })
    navigate('/matters')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Edit Matter</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Matter Name *</label>
            <input className="form-input"
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
            <textarea className="form-input h-20 resize-none"
              {...register('description')} />
          </div>
          <div>
            <label className="form-label">Status</label>
            <select className="form-input" {...register('status')}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handleDelete}
            className="w-full text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg px-4 py-2 transition-colors border border-red-200"
          >
            <Trash2 className="h-3.5 w-3.5 inline mr-1.5" />
            Delete this matter
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Party Modal ──────────────────────────────────────────────────────────
function EditPartyModal({ party, matterId, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name:             party.name,
      type:             party.type,
      share_percentage: party.share_percentage,
      notes:            party.notes || '',
    }
  })

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_parties').update({
      name:             values.name,
      type:             values.type,
      share_percentage: parseFloat(values.share_percentage),
      notes:            values.notes,
    }).eq('id', party.id)
    if (error) { toast.error(error.message); return }
    toast.success('Party updated!')
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Edit Party</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Party Name *</label>
            <input className="form-input" placeholder="Acme Corporation"
              {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Type</label>
            <select className="form-input" {...register('type')}>
              <option value="defendant">Defendant</option>
              <option value="plaintiff">Plaintiff</option>
              <option value="third_party">Third Party</option>
              <option value="cross_defendant">Cross-Defendant</option>
            </select>
          </div>
          <div>
            <label className="form-label">Share Percentage (%)</label>
            <input type="number" step="0.01" min="0" max="100" className="form-input"
              placeholder="50.00"
              {...register('share_percentage', { required: 'Required', min: 0, max: 100 })} />
            {errors.share_percentage && <p className="text-red-500 text-xs mt-1">{errors.share_percentage.message}</p>}
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input h-20 resize-none" {...register('notes')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Party Modal ───────────────────────────────────────────────────────────
function AddPartyModal({ matterId, onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_parties').insert({
      matter_id:        matterId,
      org_id:           profile.org_id,
      name:             values.name,
      type:             values.type,
      share_percentage: parseFloat(values.share_percentage),
      notes:            values.notes,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Party added!')
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Add Party</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Party Name *</label>
            <input className="form-input" placeholder="Acme Corporation"
              {...register('name', { required: 'Name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="form-label">Type</label>
            <select className="form-input" {...register('type')}>
              <option value="defendant">Defendant</option>
              <option value="plaintiff">Plaintiff</option>
              <option value="third_party">Third Party</option>
              <option value="cross_defendant">Cross-Defendant</option>
            </select>
          </div>
          <div>
            <label className="form-label">Share Percentage (%)</label>
            <input type="number" step="0.01" min="0" max="100" className="form-input"
              placeholder="50.00"
              {...register('share_percentage', { required: 'Required', min: 0, max: 100 })} />
            {errors.share_percentage && <p className="text-red-500 text-xs mt-1">{errors.share_percentage.message}</p>}
          </div>
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-input h-20 resize-none" {...register('notes')} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Shared insurer policy period fields (used by Add and Edit modals) ────────
function InsurerPolicyFields({ register }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Policy Start *</label>
          <input type="date" className="form-input" {...register('policy_start', { required: 'Required' })} />
        </div>
        <div>
          <label className="form-label">Policy End *</label>
          <input type="date" className="form-input" {...register('policy_end', { required: 'Required' })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="form-label">Policy Limit ($)</label>
          <input type="number" step="0.01" className="form-input" placeholder="1,000,000"
            {...register('policy_limit')} />
        </div>
        <div>
          <label className="form-label">Deductible ($)</label>
          <input type="number" step="0.01" className="form-input" placeholder="10,000"
            {...register('deductible')} />
        </div>
      </div>
      <div className="border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Contact Info</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Claim Number</label>
            <input className="form-input" placeholder="CLM-2024-001234"
              {...register('claim_number')} />
          </div>
          <div>
            <label className="form-label">Claims Rep Name</label>
            <input className="form-input" placeholder="Jane Smith"
              {...register('claims_rep_name')} />
          </div>
        </div>
        <div className="mt-4">
          <label className="form-label">Claims Rep Email</label>
          <input type="email" className="form-input" placeholder="jsmith@travelers.com"
            {...register('claims_rep_email')} />
        </div>
        <div className="mt-4">
          <label className="form-label">Billing Address</label>
          <textarea className="form-input h-16 resize-none"
            placeholder="P.O. Box 1234, Hartford, CT 06101"
            {...register('billing_address')} />
        </div>
      </div>
    </>
  )
}

// ── Edit Insurer Modal ────────────────────────────────────────────────────────
function EditInsurerModal({ pp, matterId, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      policy_start:      pp.policy_start,
      policy_end:        pp.policy_end,
      policy_limit:      pp.policy_limit      || '',
      deductible:        pp.deductible        || '',
      claim_number:      pp.claim_number      || '',
      claims_rep_name:   pp.claims_rep_name   || '',
      claims_rep_email:  pp.claims_rep_email  || '',
      billing_address:   pp.billing_address   || '',
    }
  })

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_insurer_policy_periods').update({
      policy_start:     values.policy_start,
      policy_end:       values.policy_end,
      policy_limit:     values.policy_limit     ? parseFloat(values.policy_limit)     : null,
      deductible:       values.deductible       ? parseFloat(values.deductible)       : null,
      claim_number:     values.claim_number     || null,
      claims_rep_name:  values.claims_rep_name  || null,
      claims_rep_email: values.claims_rep_email || null,
      billing_address:  values.billing_address  || null,
    }).eq('id', pp.id)
    if (error) { toast.error(error.message); return }
    toast.success('Policy period updated!')
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg">Edit Policy Period</h2>
            <p className="text-sm text-slate-500 mt-0.5">{pp.insurers?.name} · {pp.parties?.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <InsurerPolicyFields register={register} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Add Insurer Modal ─────────────────────────────────────────────────────────
function AddInsurerModal({ matterId, parties, onClose }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (values) => {
    // Create or find insurer
    let insurerId
    const { data: existing } = await supabase
      .from('la_insurers')
      .select('id')
      .eq('org_id', profile.org_id)
      .eq('name', values.insurer_name)
      .single()

    if (existing) {
      insurerId = existing.id
    } else {
      const { data: newIns, error } = await supabase.from('la_insurers').insert({
        org_id:        profile.org_id,
        name:          values.insurer_name,
        policy_number: values.policy_number,
      }).select().single()
      if (error) { toast.error(error.message); return }
      insurerId = newIns.id
    }

    // Create policy period with contact info
    const { error: ppErr } = await supabase.from('la_insurer_policy_periods').insert({
      insurer_id:       insurerId,
      party_id:         values.party_id,
      matter_id:        matterId,
      org_id:           profile.org_id,
      policy_start:     values.policy_start,
      policy_end:       values.policy_end,
      policy_limit:     values.policy_limit     ? parseFloat(values.policy_limit)     : null,
      deductible:       values.deductible       ? parseFloat(values.deductible)       : null,
      claim_number:     values.claim_number     || null,
      claims_rep_name:  values.claims_rep_name  || null,
      claims_rep_email: values.claims_rep_email || null,
      billing_address:  values.billing_address  || null,
    })
    if (ppErr) { toast.error(ppErr.message); return }
    toast.success('Insurer & policy period added!')
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg">Add Insurer & Policy Period</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="form-label">Insurer Name *</label>
            <input className="form-input" placeholder="Travelers Indemnity Company"
              {...register('insurer_name', { required: 'Required' })} />
            {errors.insurer_name && <p className="text-red-500 text-xs mt-1">{errors.insurer_name.message}</p>}
          </div>
          <div>
            <label className="form-label">Policy Number</label>
            <input className="form-input" placeholder="GL-2019-001234"
              {...register('policy_number')} />
          </div>
          <div>
            <label className="form-label">Insured Party *</label>
            <select className="form-input" {...register('party_id', { required: 'Required' })}>
              <option value="">Select party…</option>
              {parties?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {errors.party_id && <p className="text-red-500 text-xs mt-1">{errors.party_id.message}</p>}
          </div>
          <InsurerPolicyFields register={register} />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add Insurer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MatterDetail() {
  const { matterId } = useParams()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [showEditMatter, setShowEditMatter] = useState(false)
  const [showAddParty, setShowAddParty] = useState(false)
  const [editingParty, setEditingParty] = useState(null)
  const [editingPct, setEditingPct] = useState({})   // { [partyId]: stringValue }
  const [showAddInsurer, setShowAddInsurer] = useState(false)
  const [showUploadDoc, setShowUploadDoc] = useState(false)
  const [editingInsurer, setEditingInsurer] = useState(null)
  const [showUploadInvoice, setShowUploadInvoice] = useState(false)
  const [showUseTemplate, setShowUseTemplate] = useState(false)

  const { data: matter, isLoading } = useQuery({
    queryKey: ['matter', matterId],
    queryFn: async () => {
      const { data } = await supabase.from('la_matters').select('*').eq('id', matterId).single()
      return data
    }
  })

  const { data: parties = [] } = useQuery({
    queryKey: ['matter-parties', matterId],
    queryFn: async () => {
      const { data } = await supabase.from('la_parties').select('*').eq('matter_id', matterId).order('created_at')
      return data || []
    }
  })

  const { data: insurerPeriods = [] } = useQuery({
    queryKey: ['matter-insurers', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_insurer_policy_periods')
        .select('*, insurers:la_insurers(name, policy_number), parties:la_parties(name)')
        .eq('matter_id', matterId)
        .order('policy_start')
      return data || []
    }
  })

  const { data: invoices = [] } = useQuery({
    queryKey: ['matter-invoices', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_invoices')
        .select('*')
        .eq('matter_id', matterId)
        .order('invoice_date', { ascending: false })
      return data || []
    }
  })

  const { data: documents = [], refetch: refetchDocs } = useQuery({
    queryKey: ['matter-documents', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_matter_documents')
        .select('*, uploader:la_profiles(first_name, last_name)')
        .eq('matter_id', matterId)
        .order('created_at', { ascending: false })
      return data || []
    }
  })

  const { data: apportionments = [] } = useQuery({
    queryKey: ['matter-apportionments', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select('*, invoices:la_invoices(invoice_number, total_amount)')
        .eq('matter_id', matterId)
        .order('calculated_at', { ascending: false })
      return data || []
    }
  })

  // Financials — full payment breakdown across all apportionments
  const { data: financialRows = [] } = useQuery({
    queryKey: ['matter-financials', matterId],
    queryFn: async () => {
      const { data } = await supabase
        .from('la_apportionments')
        .select(`
          id, calculated_at,
          invoices:la_invoices(id, invoice_number, invoice_date, total_amount),
          party_apportionments:la_party_apportionments(
            id, amount,
            parties:la_parties(name),
            insurer_apportionments:la_insurer_apportionments(
              id, amount, amount_paid, payment_status, demanded_at, payment_date,
              insurers:la_insurers(id, name, policy_number)
            )
          )
        `)
        .eq('matter_id', matterId)
        .order('calculated_at', { ascending: false })
      return data || []
    }
  })

  const deleteParty = async (id) => {
    if (!confirm('Remove this party?')) return
    await supabase.from('la_parties').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    toast.success('Party removed')
  }

  const deleteInsurer = async (id) => {
    if (!confirm('Remove this policy period?')) return
    await supabase.from('la_insurer_policy_periods').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    toast.success('Policy period removed')
  }

  const equalizeShares = async () => {
    if (parties.length === 0) return
    const equal = parseFloat((100 / parties.length).toFixed(4))
    const remainder = parseFloat((100 - equal * (parties.length - 1)).toFixed(4))
    const updates = parties.map((p, i) =>
      supabase.from('la_parties').update({ share_percentage: i === parties.length - 1 ? remainder : equal }).eq('id', p.id)
    )
    await Promise.all(updates)
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    toast.success('Shares equalized!')
  }

  const savePct = async (partyId, rawValue) => {
    const val = parseFloat(rawValue)
    if (isNaN(val) || val < 0 || val > 100) {
      setEditingPct(prev => { const n = {...prev}; delete n[partyId]; return n })
      toast.error('Percentage must be between 0 and 100')
      return
    }
    const rounded = parseFloat(val.toFixed(4))
    const { error } = await supabase.from('la_parties').update({ share_percentage: rounded }).eq('id', partyId)
    setEditingPct(prev => { const n = {...prev}; delete n[partyId]; return n })
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
  }

  const splitRemaining = async () => {
    const remaining = parseFloat((100 - totalPartyPct).toFixed(4))
    if (remaining <= 0 || parties.length === 0) return
    const share = parseFloat((remaining / parties.length).toFixed(4))
    const updates = parties.map((p, i) => {
      const newPct = parseFloat((p.share_percentage + (i === parties.length - 1
        ? parseFloat((remaining - share * (parties.length - 1)).toFixed(4))
        : share)).toFixed(4))
      return supabase.from('la_parties').update({ share_percentage: newPct }).eq('id', p.id)
    })
    await Promise.all(updates)
    qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })
    toast.success('Remaining % split evenly!')
  }

  // Cumulative amount owed per insurer across all apportionments (for exhaustion tracking)
  const owedByInsurerId = {}
  ;(financialRows || []).forEach(appt => {
    ;(appt.party_apportionments || []).forEach(pa => {
      ;(pa.insurer_apportionments || []).forEach(ia => {
        const key = ia.insurers?.id
        if (key) owedByInsurerId[key] = (owedByInsurerId[key] || 0) + (ia.amount || 0)
      })
    })
  })

  const totalPartyPct = parties.reduce((s, p) => s + (p.share_percentage || 0), 0)
  const statusColors = {
    active: 'bg-green-100 text-green-700', closed: 'bg-slate-100 text-slate-600',
    draft: 'bg-slate-100 text-slate-500', parsed: 'bg-blue-100 text-blue-700',
    apportioned: 'bg-purple-100 text-purple-700',
  }

  if (isLoading) return <div className="p-8 text-center text-slate-400">Loading matter…</div>
  if (!matter)   return <div className="p-8 text-center text-slate-400">Matter not found.</div>

  const isTemplate = !!matter.is_template
  const TABS = ALL_TABS.filter(t => !isTemplate || !TEMPLATE_HIDDEN_TABS.has(t.key))

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/matters" className="flex items-center gap-1 text-slate-500 hover:text-brand-600 text-sm mb-3 transition-colors">
          <ArrowLeft className="h-3 w-3" /> All Matters
        </Link>

        {/* Template banner */}
        {isTemplate && (
          <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4">
            <LayoutTemplate className="h-5 w-5 text-violet-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-800">This is a template</p>
              <p className="text-xs text-violet-600 mt-0.5">
                Configure parties and insurer assignments here, then use "Create Matter from Template" to spin up new matters instantly.
              </p>
            </div>
            <button
              onClick={() => setShowUseTemplate(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
            >
              <Copy className="h-4 w-4" />
              Create Matter from Template
            </button>
          </div>
        )}

        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{matter.name}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {matter.matter_number && <span className="mr-3">#{matter.matter_number}</span>}
              {matter.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isTemplate
              ? <span className="badge bg-violet-100 text-violet-700 text-sm px-3 py-1">Template</span>
              : <span className={`badge ${statusColors[matter.status] || 'bg-slate-100 text-slate-500'} text-sm px-3 py-1`}>{matter.status}</span>
            }
            <button
              onClick={() => setShowEditMatter(true)}
              className="btn-secondary text-sm"
              title="Edit matter"
            >
              <Edit2 className="h-4 w-4" /> Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-brand-600">{parties.length}</p>
            <p className="text-sm text-slate-500 mt-1">Parties</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-brand-600">{insurerPeriods.length}</p>
            <p className="text-sm text-slate-500 mt-1">Policy Periods</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-brand-600">{invoices.length}</p>
            <p className="text-sm text-slate-500 mt-1">Invoices</p>
          </div>
          <div className="card p-5 text-center">
            <p className="text-3xl font-bold text-brand-600">
              {formatCurrency(invoices.reduce((s, i) => s + (i.total_amount || 0), 0))}
            </p>
            <p className="text-sm text-slate-500 mt-1">Total Invoiced</p>
          </div>
        </div>
      )}

      {/* ── Financials Tab ── */}
      {tab === 'financials' && (() => {
        // Aggregate all insurer rows across all apportionments
        const allIA = financialRows.flatMap(appt =>
          appt.party_apportionments.flatMap(pa =>
            (pa.insurer_apportionments || []).map(ia => ({
              ...ia,
              party_name:     pa.parties?.name,
              invoice_number: appt.invoices?.invoice_number,
              invoice_date:   appt.invoices?.invoice_date,
              apportionment_id: appt.id,
            }))
          )
        )

        // Totals
        const totalInvoiced    = invoices.reduce((s, i) => s + (i.total_amount || 0), 0)
        const totalApportioned = allIA.reduce((s, ia) => s + (ia.amount || 0), 0)
        const totalPaid        = allIA.reduce((s, ia) => s + (ia.amount_paid || 0), 0)
        const totalDemanded    = allIA.filter(ia => ['demanded','paid','partially_paid','disputed'].includes(ia.payment_status))
                                      .reduce((s, ia) => s + (ia.amount || 0), 0)
        const totalOutstanding = totalApportioned - totalPaid

        // By insurer
        const byInsurer = {}
        allIA.forEach(ia => {
          const key = ia.insurers?.id
          if (!key) return
          if (!byInsurer[key]) byInsurer[key] = {
            name: ia.insurers?.name, policy_number: ia.insurers?.policy_number,
            owed: 0, paid: 0, invoices: new Set()
          }
          byInsurer[key].owed    += ia.amount || 0
          byInsurer[key].paid    += ia.amount_paid || 0
          byInsurer[key].invoices.add(ia.invoice_number)
        })

        // By party
        const byParty = {}
        financialRows.forEach(appt =>
          appt.party_apportionments.forEach(pa => {
            const key = pa.parties?.name
            if (!key) return
            if (!byParty[key]) byParty[key] = { owed: 0, paid: 0 }
            byParty[key].owed += pa.amount || 0
            byParty[key].paid += (pa.insurer_apportionments || []).reduce((s, ia) => s + (ia.amount_paid || 0), 0)
          })
        )

        // Augment byInsurer with policy limits (sum across all their policy periods for this matter)
        insurerPeriods.forEach(pp => {
          const key = pp.insurer_id
          if (!byInsurer[key] || !pp.policy_limit) return
          byInsurer[key].policy_limit = (byInsurer[key].policy_limit || 0) + Number(pp.policy_limit)
        })

        // Insurers at or above 70% exhaustion, sorted by worst first
        const exhaustionWarnings = Object.values(byInsurer)
          .filter(ins => ins.policy_limit && (ins.owed / ins.policy_limit) >= 0.7)
          .map(ins => ({ ...ins, pct: (ins.owed / ins.policy_limit) * 100 }))
          .sort((a, b) => b.pct - a.pct)

        return (
          <div className="space-y-6">
            {/* Policy limit exhaustion warnings */}
            {exhaustionWarnings.length > 0 && (
              <div className="space-y-2">
                {exhaustionWarnings.map((ins, i) => {
                  const info = exhaustionInfo(ins.pct)
                  const overLimit = ins.owed > ins.policy_limit
                  return (
                    <div key={i} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      ins.pct >= 100 ? 'bg-red-50 border-red-200' :
                      ins.pct >= 90  ? 'bg-orange-50 border-orange-200' :
                                       'bg-amber-50 border-amber-200'
                    }`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className={`h-4 w-4 flex-shrink-0 ${info.color}`} />
                        <span className={`text-sm font-semibold ${info.color}`}>{ins.name}</span>
                        <span className="text-sm text-slate-600 truncate">
                          {formatCurrency(ins.owed)} of {formatCurrency(ins.policy_limit)} limit used
                          {overLimit
                            ? ` — over by ${formatCurrency(ins.owed - ins.policy_limit)}`
                            : ` — ${formatCurrency(ins.policy_limit - ins.owed)} remaining`}
                        </span>
                      </div>
                      <span className={`badge ${info.badge} text-xs whitespace-nowrap ml-3`}>
                        {ins.pct.toFixed(0)}% — {info.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Invoiced</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalInvoiced)}</p>
                <p className="text-xs text-slate-400 mt-1">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Apportioned</p>
                <p className="text-2xl font-bold text-brand-700 mt-1">{formatCurrency(totalApportioned)}</p>
                <p className="text-xs text-slate-400 mt-1">{apportionments.length} apportionment{apportionments.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Total Paid</p>
                <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(totalPaid)}</p>
                {totalApportioned > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{((totalPaid / totalApportioned) * 100).toFixed(0)}% collected</p>
                )}
              </div>
              <div className="card p-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Outstanding</p>
                <p className={`text-2xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatCurrency(totalOutstanding)}
                </p>
                {totalOutstanding > 0 && totalApportioned > 0 && (
                  <p className="text-xs text-slate-400 mt-1">{((totalOutstanding / totalApportioned) * 100).toFixed(0)}% remaining</p>
                )}
              </div>
            </div>

            {/* By insurer */}
            <div className="card overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">By Insurer</h2>
                <p className="text-xs text-slate-400 mt-0.5">Cumulative across all apportionments</p>
              </div>
              {Object.keys(byInsurer).length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No apportionments run yet.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Insurer</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Policy #</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total Owed</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Paid</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Outstanding</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Policy Limit</th>
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Exhaustion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.values(byInsurer).sort((a,b) => b.owed - a.owed).map((ins, i) => {
                      const outstanding = ins.owed - ins.paid
                      const pct = ins.owed > 0 ? (ins.paid / ins.owed) * 100 : 0
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-4 font-medium text-slate-800">{ins.name}</td>
                          <td className="px-4 py-4 text-sm font-mono text-slate-500">{ins.policy_number || '—'}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-800">{formatCurrency(ins.owed)}</td>
                          <td className="px-4 py-4 text-right font-semibold text-green-700">{formatCurrency(ins.paid)}</td>
                          <td className="px-4 py-4 text-right">
                            <span className={`font-semibold ${outstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {formatCurrency(outstanding)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right text-sm text-slate-600">
                            {ins.policy_limit ? formatCurrency(ins.policy_limit) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-4">
                            {ins.policy_limit ? (() => {
                              const xPct = (ins.owed / ins.policy_limit) * 100
                              const info = exhaustionInfo(xPct)
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-1.5">
                                    <div className={`${info.barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(xPct, 100)}%` }} />
                                  </div>
                                  <span className={`text-xs font-medium ${info.color}`}>{xPct.toFixed(0)}%</span>
                                  {xPct >= 70 && <span className={`badge ${info.badge} text-xs`}>{info.label}</span>}
                                </div>
                              )
                            })() : <span className="text-xs text-slate-300">No limit set</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={2} className="px-5 py-3 font-bold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(totalApportioned)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(totalPaid)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">{formatCurrency(totalOutstanding)}</td>
                      <td /><td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* By party */}
            {Object.keys(byParty).length > 0 && (
              <div className="card overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">By Party</h2>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Party</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total Owed</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer Paid</th>
                      <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(byParty).sort((a,b) => b[1].owed - a[1].owed).map(([name, p]) => (
                      <tr key={name} className="hover:bg-slate-50">
                        <td className="px-5 py-4 font-medium text-slate-800">{name}</td>
                        <td className="px-4 py-4 text-right font-semibold text-slate-800">{formatCurrency(p.owed)}</td>
                        <td className="px-4 py-4 text-right font-semibold text-green-700">{formatCurrency(p.paid)}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold ${p.owed - p.paid > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                            {formatCurrency(p.owed - p.paid)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Invoice-level detail */}
            {financialRows.length > 0 && (
              <div className="card overflow-hidden">
                <div className="p-5 border-b border-slate-100">
                  <h2 className="font-semibold text-slate-900">Invoice Detail</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Payment status per insurer per invoice</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Invoice</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Party</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Insurer</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Owed</th>
                        <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Paid</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                        <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Payment Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allIA.map((ia, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-5 py-3 text-sm font-medium text-slate-800">
                            <Link to={`/matters/${matterId}/apportionments/${ia.apportionment_id}`}
                              className="hover:text-brand-600 transition-colors">
                              {ia.invoice_number || 'Invoice'}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">{ia.party_name}</td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-800">{ia.insurers?.name}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(ia.amount)}</td>
                          <td className="px-4 py-3 text-right text-green-700 font-semibold">
                            {ia.amount_paid > 0 ? formatCurrency(ia.amount_paid) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`badge ${PAYMENT_STATUS_COLORS[ia.payment_status] || 'bg-slate-100 text-slate-600'}`}>
                              {PAYMENT_STATUS_LABELS[ia.payment_status] || ia.payment_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {ia.payment_date ? format(parseISO(ia.payment_date), 'MM/dd/yyyy') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Parties Tab ── */}
      {tab === 'parties' && (() => {
        const remaining = parseFloat((100 - totalPartyPct).toFixed(4))
        const isOver    = totalPartyPct > 100
        const isUnder   = totalPartyPct < 100
        const isExact   = totalPartyPct === 100
        return (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Parties</h2>
              <p className="text-xs text-slate-400 mt-0.5">Click any percentage to edit it inline.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {isUnder && parties.length > 0 && (
                <button onClick={splitRemaining} className="btn-secondary text-sm text-amber-700 border-amber-300 hover:bg-amber-50">
                  <Plus className="h-4 w-4" /> Split {remaining}% remaining
                </button>
              )}
              {parties.length > 1 && (
                <button onClick={equalizeShares} className="btn-secondary text-sm">
                  <Check className="h-4 w-4" /> Equalize
                </button>
              )}
              <button onClick={() => setShowAddParty(true)} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Party
              </button>
            </div>
          </div>

          {/* Total alert */}
          {parties.length > 0 && !isExact && (
            <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              isOver ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}>
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {isOver
                ? `Shares total ${totalPartyPct}% — over 100% by ${Math.abs(remaining)}%. Reduce one or more parties.`
                : `Shares total ${totalPartyPct}% — ${remaining}% unassigned. Apportionment won't reach 100% until this is resolved.`}
            </div>
          )}

          <div className="card overflow-hidden">
            {parties.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Users className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No parties added yet.</p>
                <button onClick={() => setShowAddParty(true)} className="btn-primary mt-4">
                  <Plus className="h-4 w-4" /> Add First Party
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Name</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Type</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">
                      Share %
                      <span className="text-slate-300 font-normal ml-1 normal-case">(click to edit)</span>
                    </th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Notes</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parties.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-800">{p.name}</td>
                      <td className="px-4 py-4">
                        <span className="badge bg-slate-100 text-slate-600 capitalize">{p.type?.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingPct[p.id] !== undefined ? (
                          <input
                            type="number" step="0.01" min="0" max="100"
                            value={editingPct[p.id]}
                            onChange={e => setEditingPct(prev => ({ ...prev, [p.id]: e.target.value }))}
                            onBlur={() => savePct(p.id, editingPct[p.id])}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.target.blur() }
                              if (e.key === 'Escape') { setEditingPct(prev => { const n={...prev}; delete n[p.id]; return n }) }
                            }}
                            className="w-24 text-right form-input py-1 px-2 text-sm font-semibold"
                            autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => setEditingPct(prev => ({ ...prev, [p.id]: String(p.share_percentage) }))}
                            className="font-semibold text-slate-800 hover:text-brand-600 hover:bg-brand-50 rounded px-2 py-1 transition-colors group"
                            title="Click to edit"
                          >
                            {p.share_percentage}%
                            <Edit2 className="h-3 w-3 inline ml-1 text-slate-300 group-hover:text-brand-400" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-400 max-w-xs truncate">{p.notes || '—'}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingParty(p)} className="text-slate-300 hover:text-brand-600 transition-colors" title="Edit name / type / notes">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteParty(p.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="Remove party">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-slate-700">Total</td>
                    <td className={`px-4 py-3 text-right font-bold text-sm ${
                      isExact ? 'text-green-600' : isOver ? 'text-red-600' : 'text-amber-600'
                    }`}>
                      {totalPartyPct}%
                      {isExact && <span className="ml-1.5 text-xs font-normal text-green-500">✓</span>}
                      {isUnder && <span className="ml-1.5 text-xs font-normal text-amber-500">({remaining}% remaining)</span>}
                      {isOver  && <span className="ml-1.5 text-xs font-normal text-red-500">(over by {Math.abs(remaining)}%)</span>}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
        )
      })()}

      {/* ── Insurers Tab ── */}
      {tab === 'insurers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Insurers & Policy Periods</h2>
            <button onClick={() => setShowAddInsurer(true)} className="btn-primary" disabled={parties.length === 0}>
              <Plus className="h-4 w-4" /> Add Insurer
            </button>
          </div>
          {parties.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 text-amber-700 text-sm">
              Add parties first before adding insurers.
            </div>
          )}
          <div className="card overflow-hidden">
            {insurerPeriods.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Shield className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No insurers added yet.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Insurer</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Policy #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Claim #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Claims Rep</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Party</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Policy Period</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Limit</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Exhaustion</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {insurerPeriods.map(pp => {
                    const owed = owedByInsurerId[pp.insurer_id] || 0
                    const xPct = pp.policy_limit && owed > 0 ? (owed / Number(pp.policy_limit)) * 100 : null
                    const info = xPct !== null ? exhaustionInfo(xPct) : null
                    return (
                    <tr key={pp.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-800">{pp.insurers?.name}</td>
                      <td className="px-4 py-4 text-sm font-mono text-slate-500">{pp.insurers?.policy_number || '—'}</td>
                      <td className="px-4 py-4 text-sm font-mono text-slate-600">{pp.claim_number || '—'}</td>
                      <td className="px-4 py-4">
                        {pp.claims_rep_name ? (
                          <div>
                            <p className="text-sm font-medium text-slate-700">{pp.claims_rep_name}</p>
                            {pp.claims_rep_email && (
                              <a href={`mailto:${pp.claims_rep_email}`}
                                className="text-xs text-brand-600 hover:underline">
                                {pp.claims_rep_email}
                              </a>
                            )}
                          </div>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{pp.parties?.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600 whitespace-nowrap">
                        {format(parseISO(pp.policy_start), 'MM/dd/yyyy')} — {format(parseISO(pp.policy_end), 'MM/dd/yyyy')}
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-slate-600">
                        {pp.policy_limit ? formatCurrency(pp.policy_limit) : '—'}
                      </td>
                      <td className="px-4 py-4">
                        {xPct !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div className={`${info.barColor} h-1.5 rounded-full`} style={{ width: `${Math.min(xPct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${info.color}`}>{xPct.toFixed(0)}%</span>
                            {xPct >= 70 && <span className={`badge ${info.badge} text-xs`}>{info.label}</span>}
                          </div>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingInsurer(pp)}
                            className="text-slate-300 hover:text-brand-600 transition-colors" title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button onClick={() => deleteInsurer(pp.id)}
                            className="text-slate-300 hover:text-red-500 transition-colors" title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Invoices Tab ── */}
      {tab === 'invoices' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Invoices</h2>
            <button onClick={() => setShowUploadInvoice(true)} className="btn-primary">
              <Upload className="h-4 w-4" /> Upload Invoice
            </button>
          </div>
          <div className="card overflow-hidden">
            {invoices.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No invoices uploaded yet.</p>
                <button onClick={() => setShowUploadInvoice(true)} className="btn-primary mt-4">
                  <Upload className="h-4 w-4" /> Upload First Invoice
                </button>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Invoice #</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Billing Firm</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Date</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Amount</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-800">{inv.invoice_number || 'Draft'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{inv.billing_firm || '—'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {inv.invoice_date ? format(parseISO(inv.invoice_date), 'MM/dd/yyyy') : '—'}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-800">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-4 py-4">
                        <span className={`badge ${statusColors[inv.status] || 'bg-slate-100 text-slate-500'}`}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/matters/${matterId}/invoices/${inv.id}`}
                          className="text-slate-400 hover:text-brand-600 transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Apportionments Tab ── */}
      {tab === 'apportionments' && (
        <div>
          <h2 className="font-semibold text-slate-900 mb-4">Apportionments</h2>
          <div className="card overflow-hidden">
            {apportionments.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <Calculator className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p>No apportionments calculated yet.</p>
                <p className="text-xs mt-1">Upload an invoice, then run an apportionment from the invoice detail page.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-5 py-3">Invoice</th>
                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Total</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Method</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Calculated</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apportionments.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-medium text-slate-800">{a.invoices?.invoice_number || 'Invoice'}</td>
                      <td className="px-4 py-4 text-right font-semibold">{formatCurrency(a.invoices?.total_amount)}</td>
                      <td className="px-4 py-4 text-sm text-slate-500 capitalize">{a.calculation_method?.replace('_', ' ')}</td>
                      <td className="px-4 py-4 text-sm text-slate-400">
                        {a.calculated_at ? format(parseISO(a.calculated_at), 'MM/dd/yyyy HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <Link to={`/matters/${matterId}/apportionments/${a.id}`}
                          className="text-slate-400 hover:text-brand-600 transition-colors">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Documents Tab ── */}
      {tab === 'documents' && (() => {
        const docTypeMap = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]))

        const downloadDoc = async (doc) => {
          const { data, error } = await supabase.storage
            .from('la_documents')
            .createSignedUrl(doc.file_path, 3600)
          if (error) { toast.error('Could not generate download link'); return }
          window.open(data.signedUrl, '_blank')
        }

        const deleteDoc = async (doc) => {
          if (!confirm(`Delete "${doc.name}"?`)) return
          await supabase.storage.from('la_documents').remove([doc.file_path])
          await supabase.from('la_matter_documents').delete().eq('id', doc.id)
          refetchDocs()
          toast.success('Document deleted')
        }

        // Group by doc_type
        const grouped = {}
        documents.forEach(d => {
          const key = d.doc_type || 'other'
          if (!grouped[key]) grouped[key] = []
          grouped[key].push(d)
        })
        // Sort groups by DOC_TYPES order
        const orderedGroups = DOC_TYPES
          .filter(t => grouped[t.value])
          .map(t => ({ type: t, docs: grouped[t.value] }))

        return (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Documents</h2>
                <p className="text-xs text-slate-400 mt-0.5">Coverage opinions, ROR letters, settlement agreements, and more.</p>
              </div>
              <button onClick={() => setShowUploadDoc(true)} className="btn-primary">
                <Paperclip className="h-4 w-4" /> Attach Document
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="card p-12 text-center text-slate-400">
                <Paperclip className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No documents attached yet.</p>
                <p className="text-sm mt-1 mb-4">Attach coverage opinions, ROR letters, settlement agreements, and other key documents.</p>
                <button onClick={() => setShowUploadDoc(true)} className="btn-primary">
                  <Paperclip className="h-4 w-4" /> Attach First Document
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {orderedGroups.map(({ type, docs }) => (
                  <div key={type.value} className="card overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                      <span className={`badge text-xs font-semibold ${type.color}`}>{type.label}</span>
                      <span className="text-xs text-slate-400">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <table className="w-full">
                      <tbody className="divide-y divide-slate-100">
                        {docs.map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-50 group">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
                                <div>
                                  <p className="text-sm font-medium text-slate-800">{doc.name}</p>
                                  <p className="text-xs text-slate-400">{doc.file_name}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden sm:table-cell">
                              {doc.file_size ? `${(doc.file_size / 1048576).toFixed(1)} MB` : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                              {doc.uploader
                                ? `${doc.uploader.first_name || ''} ${doc.uploader.last_name || ''}`.trim() || 'Unknown'
                                : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                              {format(new Date(doc.created_at), 'MM/dd/yyyy')}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 max-w-xs hidden xl:table-cell">
                              {doc.notes && <span className="truncate block">{doc.notes}</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => downloadDoc(doc)}
                                  className="text-slate-400 hover:text-brand-600 transition-colors"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deleteDoc(doc)}
                                  className="text-slate-300 hover:text-red-500 transition-colors"
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Modals */}
      {showEditMatter  && <EditMatterModal matter={matter} onClose={() => setShowEditMatter(false)} />}
      {showAddParty    && <AddPartyModal   matterId={matterId} onClose={() => setShowAddParty(false)} />}
      {editingParty    && <EditPartyModal  party={editingParty} matterId={matterId} onClose={() => setEditingParty(null)} />}
      {showAddInsurer  && <AddInsurerModal matterId={matterId} parties={parties} onClose={() => setShowAddInsurer(false)} />}
      {editingInsurer  && <EditInsurerModal pp={editingInsurer} matterId={matterId} onClose={() => setEditingInsurer(null)} />}
      {showUploadInvoice && (
        <InvoiceUploadModal
          matterId={matterId}
          onClose={() => { setShowUploadInvoice(false); qc.invalidateQueries({ queryKey: ['matter-invoices', matterId] }) }}
        />
      )}
      {showUploadDoc && (
        <DocumentUploadModal
          matterId={matterId}
          onClose={() => setShowUploadDoc(false)}
          onUploaded={() => { refetchDocs(); setShowUploadDoc(false) }}
        />
      )}
      {showUseTemplate && matter && (
        <UseTemplateModal
          template={{ ...matter, la_parties: [{ count: parties.length }] }}
          onClose={() => setShowUseTemplate(false)}
        />
      )}
    </div>
  )
}
