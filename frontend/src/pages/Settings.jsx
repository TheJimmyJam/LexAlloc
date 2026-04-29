import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth.jsx'
import { supabase } from '../lib/supabase.js'
import {
  User, Lock, Building2, Shield, ShieldCheck, ShieldOff, QrCode,
  Loader2, CheckCircle2, X, Briefcase, Plus, Trash2, FolderOpen, Landmark,
  ChevronDown, ChevronRight, ExternalLink, Mail, Phone, MapPin, UserPlus, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_COLORS = {
  admin:  'bg-brand-100 text-brand-700',
  user:   'bg-slate-100 text-slate-600',
  client: 'bg-blue-100 text-blue-700',
}

// ── 2FA Enrollment Modal ──────────────────────────────────────────────────────
function TwoFAEnrollModal({ onClose, onEnrolled }) {
  const [step,        setStep]        = useState('loading')
  const [factorId,    setFactorId]    = useState(null)
  const [challengeId, setChallengeId] = useState(null)
  const [qrCode,      setQrCode]      = useState(null)
  const [secret,      setSecret]      = useState(null)
  const [code,        setCode]        = useState('')
  const [verifying,   setVerifying]   = useState(false)
  const [showSecret,  setShowSecret]  = useState(false)

  useEffect(() => {
    async function startEnroll() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) { toast.error('Could not start 2FA setup: ' + error.message); onClose(); return }
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('scan')
    }
    startEnroll()
  }, [])

  const handleConfirm = async (e) => {
    e?.preventDefault()
    if (code.length < 6 || !factorId) return
    setVerifying(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr) { toast.error(cErr.message); return }
      setChallengeId(challenge.id)
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (vErr) { toast.error('Incorrect code — try again'); setCode(''); return }
      setStep('done')
      onEnrolled()
    } finally {
      setVerifying(false)
    }
  }

  const handleCodeChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(val)
    if (val.length === 6) setTimeout(() => handleConfirm(), 50)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-600" />
            <h2 className="font-semibold text-lg">Set Up Two-Factor Authentication</h2>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="p-6">
          {step === 'loading' && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            </div>
          )}
          {step === 'scan' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">1</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Scan the QR code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Open your authenticator app and scan the code below.</p>
                </div>
              </div>
              {qrCode && (
                <div className="flex justify-center p-4 bg-white border-2 border-slate-200 rounded-xl">
                  <img src={qrCode} alt="2FA QR Code" className="w-44 h-44" />
                </div>
              )}
              <div>
                <button type="button" onClick={() => setShowSecret(s => !s)} className="text-xs text-brand-600 hover:text-brand-700 underline">
                  {showSecret ? 'Hide' : "Can't scan? Enter code manually"}
                </button>
                {showSecret && secret && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Manual entry key:</p>
                    <code className="text-sm font-mono font-bold text-slate-800 break-all select-all">{secret}</code>
                  </div>
                )}
              </div>
              <button onClick={() => setStep('confirm')} className="btn-primary w-full justify-center">I've scanned the code →</button>
            </div>
          )}
          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-brand-50 rounded-xl border border-brand-100">
                <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">2</div>
                <div>
                  <p className="font-medium text-brand-900 text-sm">Enter the 6-digit code</p>
                  <p className="text-xs text-brand-700 mt-0.5">Enter the code shown in your authenticator app.</p>
                </div>
              </div>
              <div>
                <label className="form-label text-center block">Authentication Code</label>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  placeholder="000000" value={code} onChange={handleCodeChange} maxLength={6}
                  className="form-input text-center text-2xl font-mono tracking-[0.5em]" disabled={verifying} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('scan')} className="btn-secondary flex-1 justify-center">← Back</button>
                <button type="submit" disabled={verifying || code.length < 6} className="btn-primary flex-1 justify-center">
                  {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</> : 'Confirm & Enable'}
                </button>
              </div>
            </form>
          )}
          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-lg">2FA Enabled!</h3>
                <p className="text-sm text-slate-500 mt-1">Your account is now protected with two-factor authentication.</p>
              </div>
              <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Add Firm Modal ────────────────────────────────────────────────────────────
function AddFirmModal({ orgId, onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (values) => {
    const { error } = await supabase.from('la_firms').insert({ org_id: orgId, name: values.name.trim() })
    if (error) { toast.error(error.message); return }
    toast.success('Firm added!')
    qc.invalidateQueries({ queryKey: ['firms', orgId] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add Firm</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="form-label">Firm Name *</label>
            <input className={`form-input ${errors.name ? 'border-red-400' : ''}`}
              placeholder="Smith & Associates LLP"
              {...register('name', { required: 'Firm name is required' })} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add Firm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Firms Tab ─────────────────────────────────────────────────────────────────
function FirmsTab({ orgId }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: firms = [], isLoading } = useQuery({
    queryKey: ['firms', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('la_firms')
        .select('*, la_matters(id)')
        .eq('org_id', orgId)
        .order('name')
      return data || []
    },
  })

  const deleteFirm = async (firm) => {
    const matterCount = firm.la_matters?.length || 0
    if (matterCount > 0) {
      toast.error(`Can't delete — ${matterCount} matter${matterCount > 1 ? 's' : ''} assigned to this firm. Reassign them first.`)
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Manage the law firms associated with your matters.</p>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Add Firm
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300 mx-auto" /></div>
        ) : firms.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Briefcase className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>No firms yet.</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" /> Add First Firm
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Firm Name</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Matters</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {firms.map(firm => {
                const count = firm.la_matters?.length || 0
                return (
                  <tr key={firm.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-medium text-slate-800">{firm.name}</td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm text-slate-500">
                        <FolderOpen className="h-3.5 w-3.5" /> {count}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => deleteFirm(firm)}
                        className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete firm"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddFirmModal orgId={orgId} onClose={() => setShowAdd(false)} />}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
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
                <input className="form-input" placeholder="(800) 555-0100"
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <input className="form-input" placeholder="Address Line 1"
                    {...register('address_line1')} />
                </div>
                <div className="col-span-2">
                  <input className="form-input" placeholder="Address Line 2 (optional)"
                    {...register('address_line2')} />
                </div>
                <div>
                  <input className="form-input" placeholder="City"
                    {...register('city')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="form-input" placeholder="State"
                    {...register('state')} />
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
                  <div className="grid grid-cols-2 gap-3">
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
                      <input className="form-input" value={repPhone} onChange={e => setRepPhone(e.target.value)} placeholder="(800) 555-0100" />
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
function InsurersTab({ orgId }) {
  const qc = useQueryClient()
  const [editModal, setEditModal] = useState(null) // null | 'new' | insurer object

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

  const deleteInsurer = async (insurer) => {
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Manage carriers, their contact info, and claims representatives.</p>
        <button onClick={() => setEditModal('new')} className="btn-primary">
          <Plus className="h-4 w-4" /> Add Insurer
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300 mx-auto" /></div>
        ) : insurers.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Landmark className="h-8 w-8 mx-auto mb-2 text-slate-300" />
            <p>No insurers yet.</p>
            <button onClick={() => setEditModal('new')} className="btn-primary mt-4">
              <Plus className="h-4 w-4" /> Add First Insurer
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Insurer</th>
                <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Contact</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Reps</th>
                <th className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">Matters</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {insurers.map(insurer => {
                const repCount    = insurer.la_insurer_claims_reps?.length || 0
                const matterCount = insurer.la_insurer_policy_periods?.length || 0
                return (
                  <tr key={insurer.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-800">{insurer.name}</p>
                      {insurer.payment_portal_url && (
                        <a href={insurer.payment_portal_url} target="_blank" rel="noreferrer"
                          className="text-xs text-brand-600 hover:underline flex items-center gap-1 mt-0.5">
                          <ExternalLink className="h-3 w-3" /> Payment portal
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {insurer.contact_email && (
                          <a href={`mailto:${insurer.contact_email}`} className="text-xs text-slate-500 flex items-center gap-1 hover:text-brand-600">
                            <Mail className="h-3 w-3 flex-shrink-0" />{insurer.contact_email}
                          </a>
                        )}
                        {insurer.phone && (
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" />{insurer.phone}
                          </p>
                        )}
                        {insurer.city && (
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <MapPin className="h-3 w-3 flex-shrink-0" />{[insurer.city, insurer.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm text-slate-500">{repCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="text-sm text-slate-500">{matterCount}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditModal(insurer)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          title="Edit insurer"
                        ><Pencil className="h-3.5 w-3.5" /></button>
                        <button
                          onClick={() => deleteInsurer(insurer)}
                          className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete insurer"
                        ><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

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

// ── Main Settings Page ────────────────────────────────────────────────────────
const TABS = [
  { key: 'profile',      label: 'Profile',      icon: User       },
  { key: 'security',     label: 'Security',     icon: Shield     },
  { key: 'organization', label: 'Organization', icon: Building2  },
  { key: 'firms',        label: 'Firms',        icon: Briefcase  },
  { key: 'insurers',     label: 'Insurers',     icon: Landmark   },
]

export default function Settings() {
  const { profile, refetchProfile, hasTOTP, refreshMfaLevel } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [activeTab,    setActiveTab]    = useState('profile')
  const [showEnroll,   setShowEnroll]   = useState(false)
  const [disabling2FA, setDisabling2FA] = useState(false)

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { isSubmitting: isPwdSubmitting } } = useForm()
  const { register: regOrg, handleSubmit: handleOrgSubmit, reset: resetOrg, formState: { isSubmitting: isOrgSubmitting } } = useForm()

  useEffect(() => {
    if (profile) {
      reset({ first_name: profile.first_name, last_name: profile.last_name, email: profile.email, role: profile.role })
      resetOrg({ org_name: profile.la_organizations?.name || '' })
    }
  }, [profile])

  const onSaveProfile = async (values) => {
    const updates = { first_name: values.first_name, last_name: values.last_name }
    if (isAdmin) updates.role = values.role
    const { error } = await supabase.from('la_profiles').update(updates).eq('id', profile.id)
    if (error) { toast.error(error.message); return }
    if (isAdmin && values.email !== profile.email) {
      const { error: emailErr } = await supabase.auth.updateUser({ email: values.email })
      if (emailErr) toast.error('Profile saved but email update failed: ' + emailErr.message)
      else toast.success('Profile updated! Check your new email for a confirmation link.')
      refetchProfile(); return
    }
    toast.success('Profile updated!')
    refetchProfile()
  }

  const onChangePassword = async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { toast.error(error.message); return }
    toast.success('Password updated!')
    resetPwd()
  }

  const onSaveOrg = async (values) => {
    const { error } = await supabase.from('la_organizations').update({ name: values.org_name }).eq('id', profile.org_id)
    if (error) { toast.error(error.message); return }
    toast.success('Organization name updated!')
    refetchProfile()
  }

  const handleDisable2FA = async () => {
    if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return
    setDisabling2FA(true)
    try {
      const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors()
      if (fErr || !factors?.totp?.length) { toast.error('No 2FA factor found.'); return }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factors.totp[0].id })
      if (error) { toast.error('Failed to disable 2FA: ' + error.message); return }
      await refreshMfaLevel()
      toast.success('Two-factor authentication disabled.')
    } finally {
      setDisabling2FA(false)
    }
  }

  const handleEnrolled = async () => {
    await refreshMfaLevel()
    setShowEnroll(false)
    toast.success('Two-factor authentication is now active.')
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        {profile?.role && (
          <span className={`badge text-xs font-semibold px-2.5 py-1 capitalize ${ROLE_COLORS[profile.role] || 'bg-slate-100 text-slate-500'}`}>
            <Shield className="h-3 w-3 inline mr-1" />{profile.role}
          </span>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ── */}
      {activeTab === 'profile' && (
        <div className="card">
          <div className="flex items-center gap-2 p-5 border-b border-slate-100">
            <User className="h-4 w-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">Profile</h2>
          </div>
          <form onSubmit={handleSubmit(onSaveProfile)} className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">First Name</label>
                <input className="form-input" {...register('first_name')} />
              </div>
              <div>
                <label className="form-label">Last Name</label>
                <input className="form-input" {...register('last_name')} />
              </div>
            </div>
            <div>
              <label className="form-label">
                Email {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
              </label>
              {isAdmin ? (
                <input className="form-input" type="email" {...register('email')} />
              ) : (
                <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed" value={profile?.email || ''} disabled />
              )}
              {isAdmin && <p className="text-xs text-slate-400 mt-1">Changing email sends a confirmation link to the new address.</p>}
            </div>
            <div>
              <label className="form-label">
                Role {isAdmin && <span className="text-brand-600 text-xs ml-1">(admin editable)</span>}
              </label>
              {isAdmin ? (
                <select className="form-input" {...register('role')}>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="client">Client</option>
                </select>
              ) : (
                <input className="form-input bg-slate-50 text-slate-500 cursor-not-allowed capitalize" value={profile?.role || ''} disabled />
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
      )}

      {/* ── Security Tab ── */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* 2FA */}
          <div className="card">
            <div className="flex items-center gap-2 p-5 border-b border-slate-100">
              <ShieldCheck className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Two-Factor Authentication</h2>
              {hasTOTP && (
                <span className="ml-auto badge bg-green-100 text-green-700 text-xs">
                  <CheckCircle2 className="h-3 w-3 inline mr-0.5" /> Enabled
                </span>
              )}
            </div>
            <div className="p-5">
              {hasTOTP ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <ShieldCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800 text-sm">2FA is active on your account</p>
                      <p className="text-xs text-green-700 mt-0.5">You'll be prompted for a code each time you sign in.</p>
                    </div>
                  </div>
                  <button onClick={handleDisable2FA} disabled={disabling2FA} className="btn-secondary text-red-600 hover:bg-red-50 hover:border-red-200">
                    {disabling2FA ? <><Loader2 className="h-4 w-4 animate-spin" /> Disabling…</> : <><ShieldOff className="h-4 w-4" /> Disable Two-Factor Authentication</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 text-sm">2FA is not enabled</p>
                      <p className="text-xs text-amber-700 mt-0.5">Adds a second layer of security to your account.</p>
                    </div>
                  </div>
                  <button onClick={() => setShowEnroll(true)} className="btn-primary">
                    <QrCode className="h-4 w-4" /> Enable Two-Factor Authentication
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="card">
            <div className="flex items-center gap-2 p-5 border-b border-slate-100">
              <Lock className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-slate-900">Change Password</h2>
            </div>
            <form onSubmit={handlePwd(onChangePassword)} className="p-5 space-y-4">
              <div>
                <label className="form-label">New Password</label>
                <input type="password" className="form-input" placeholder="Min. 8 characters"
                  {...regPwd('password', { required: true, minLength: 8 })} />
              </div>
              <button type="submit" className="btn-primary" disabled={isPwdSubmitting}>
                {isPwdSubmitting ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

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

      {/* 2FA enrollment modal */}
      {showEnroll && <TwoFAEnrollModal onClose={() => setShowEnroll(false)} onEnrolled={handleEnrolled} />}
    </div>
  )
}
