import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  X, Upload, Loader2, CheckCircle, AlertCircle, Sparkles, FolderOpen,
  Users, Building2, FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { logAudit } from '../lib/audit.js'
import toast from 'react-hot-toast'

// ============================================================
// AddFromPolicyModal
// One-shot ingestion of a policy PDF that creates BOTH:
//   - the named insured (party) on this matter, and
//   - the carrier (insurer) + policy period linking them.
// Existing parties / insurers with the same normalized name are reused
// rather than duplicated, so dropping multiple policies for the same
// party each adds another insurer onto that single party.
// ============================================================

// Normalize a name for fuzzy comparison so "ABC General Contractors, Inc."
// matches "ABC General Contractors Inc" already on the matter.
function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function AddFromPolicyModal({ matterId, parties = [], onClose }) {
  const { profile }     = useAuth()
  const qc              = useQueryClient()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } =
    useForm({ defaultValues: {
      party_name: '', insurer_name: '', policy_number: '',
      policy_start: '', policy_end: '', policy_limit: '',
      claim_number: '', claims_rep_name: '', claims_rep_email: '', portal_url: '',
    }})

  const [policyFile,  setPolicyFile]  = useState(null)
  const [parsing,     setParsing]     = useState(false)
  const [parseError,  setParseError]  = useState(null)
  const [parsed,      setParsed]      = useState(false)

  const onPolicyDrop = useCallback(async (accepted) => {
    const file = accepted[0]
    if (!file) return
    setParsing(true)
    setParseError(null)
    setParsed(false)
    setPolicyFile(null)

    try {
      const ext  = file.name.split('.').pop()
      // Storage RLS requires the FIRST folder segment to equal org_id.
      const path = `${profile.org_id}/policy-docs/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('la_documents').upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)

      const { data: signed } = await supabase.storage
        .from('la_documents').createSignedUrl(path, 3600)
      if (!signed?.signedUrl) throw new Error('Could not get signed URL')

      setPolicyFile({ name: file.name, path })

      const { data, error: fnErr } = await supabase.functions.invoke('parse-policy', {
        body: { fileUrl: signed.signedUrl, fileType: file.type || 'application/pdf' },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)

      // Pre-fill any field the parser returned. Missing fields stay editable.
      if (data.named_insured)    setValue('party_name',       data.named_insured)
      if (data.insurer_name)     setValue('insurer_name',     data.insurer_name)
      if (data.policy_number)    setValue('policy_number',    data.policy_number)
      if (data.policy_start)     setValue('policy_start',     data.policy_start)
      if (data.policy_end)       setValue('policy_end',       data.policy_end)
      if (data.policy_limit)     setValue('policy_limit',     String(data.policy_limit))
      if (data.claim_number)     setValue('claim_number',     data.claim_number)
      if (data.claims_rep_name)  setValue('claims_rep_name',  data.claims_rep_name)
      if (data.claims_rep_email) setValue('claims_rep_email', data.claims_rep_email)
      if (data.portal_url)       setValue('portal_url',       data.portal_url)

      setParsed(true)
    } catch (err) {
      setParseError(err.message || 'Failed to parse policy — try again')
    } finally {
      setParsing(false)
    }
  }, [profile, setValue])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop:   onPolicyDrop,
    accept:   { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxFiles: 1,
    disabled: parsing,
  })

  // Live preview of what will happen when the user submits — does the
  // party / insurer already exist or will it be created fresh?
  const watchedParty   = watch('party_name')
  const watchedInsurer = watch('insurer_name')
  const partyMatch     = (() => {
    const n = normalizeName(watchedParty)
    if (!n) return null
    return parties.find(p => normalizeName(p.name) === n) || null
  })()
  const [insurerHit, setInsurerHit] = useState(null)
  useEffect(() => {
    const n = (watchedInsurer || '').trim()
    if (!n || !profile?.org_id) { setInsurerHit(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const { data } = await supabase.from('la_insurers')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .ilike('name', n)
        .limit(1)
      if (!cancelled) setInsurerHit(data?.[0] || null)
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [watchedInsurer, profile?.org_id])

  const onSubmit = async (values) => {
    const partyName   = values.party_name.trim()
    const insurerName = values.insurer_name.trim()
    if (!partyName)   { toast.error('Named insured (party) is required'); return }
    if (!insurerName) { toast.error('Insurer name is required'); return }
    if (!values.policy_start) { toast.error('Coverage start date is required'); return }

    // 1. Find or create the party on this matter
    let partyId
    if (partyMatch) {
      partyId = partyMatch.id
    } else {
      const { data: newParty, error: pErr } = await supabase.from('la_parties').insert({
        matter_id:        matterId,
        org_id:           profile.org_id,
        name:             partyName,
        share_percentage: 0,
      }).select().single()
      if (pErr) { toast.error('Could not add party: ' + pErr.message); return }
      partyId = newParty.id
      logAudit({
        profile, matterId,
        action: 'party.added', entityType: 'party',
        entityId: partyId, entityName: partyName,
        metadata: { source: 'policy_upload', policy_file: policyFile?.name || null },
      })
    }

    // 2. Find or create the insurer in this org
    let insurerId
    {
      const { data: existing } = await supabase.from('la_insurers')
        .select('id').eq('org_id', profile.org_id).ilike('name', insurerName).limit(1)
      if (existing?.length) {
        insurerId = existing[0].id
      } else {
        const { data: newIns, error: iErr } = await supabase.from('la_insurers').insert({
          org_id:        profile.org_id,
          name:          insurerName,
          policy_number: values.policy_number || null,
        }).select().single()
        if (iErr) { toast.error('Could not add insurer: ' + iErr.message); return }
        insurerId = newIns.id
      }
    }

    // 3. Create the policy period that ties insurer ↔ party on this matter
    const { error: ppErr } = await supabase.from('la_insurer_policy_periods').insert({
      insurer_id:       insurerId,
      party_id:         partyId,
      matter_id:        matterId,
      org_id:           profile.org_id,
      policy_start:     values.policy_start,
      policy_end:       values.policy_end || null,
      policy_limit:     values.policy_limit ? parseFloat(values.policy_limit) : null,
      claim_number:     values.claim_number      || null,
      claims_rep_name:  values.claims_rep_name   || null,
      claims_rep_email: values.claims_rep_email  || null,
      portal_url:       values.portal_url        || null,
    })
    if (ppErr) { toast.error('Could not add policy period: ' + ppErr.message); return }

    logAudit({
      profile, matterId,
      action: 'insurer.added', entityType: 'insurer',
      entityId: insurerId, entityName: insurerName,
      metadata: {
        source:      'policy_upload',
        party:       partyName,
        policy_file: policyFile?.name || null,
        policy_start: values.policy_start,
        policy_end:   values.policy_end || null,
        policy_limit: values.policy_limit || null,
      },
    })

    // Build a precise success message describing what actually happened
    const partyMsg   = partyMatch  ? `attached to existing party "${partyName}"` : `created party "${partyName}"`
    const insurerMsg = insurerHit  ? `existing insurer "${insurerName}"`         : `new insurer "${insurerName}"`
    toast.success(`Policy added — ${partyMsg} · ${insurerMsg}.`)

    qc.invalidateQueries({ queryKey: ['matter-parties',  matterId] })
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    onClose()
  }

  const handleClose = () => { reset(); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Add Party &amp; Insurer from Policy</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Drop a policy PDF — we'll extract the named insured, carrier, and coverage details.
            </p>
          </div>
          <button onClick={handleClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {/* ── Drop zone ── */}
          {!parsed && !policyFile ? (
            <div
              {...getRootProps()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
                px-4 py-6 text-center cursor-pointer transition-colors
                ${isDragActive
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-slate-200 bg-slate-50 hover:border-brand-300 hover:bg-brand-50/40'}
                ${parsing ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <input {...getInputProps()} />
              {parsing ? (
                <>
                  <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
                  <p className="text-sm font-medium text-brand-600">Parsing policy document…</p>
                  <p className="text-xs text-slate-400">AI is extracting party, carrier, and coverage details</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-brand-500" />
                    <span className="text-sm font-semibold text-brand-700">Auto-fill from policy PDF</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {isDragActive
                      ? 'Drop policy PDF here'
                      : 'Drag &amp; drop a policy PDF, or click to browse'}
                  </p>
                  <p className="text-xs text-slate-400">PDF, PNG, JPG · max 1 file</p>
                </>
              )}
            </div>
          ) : (
            <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${parsed ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-200'}`}>
              {parsed
                ? <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                : <Loader2 className="h-5 w-5 text-brand-500 animate-spin flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${parsed ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {parsed ? 'Policy parsed — review fields below' : 'Uploading…'}
                </p>
                {policyFile && <p className="text-xs text-slate-400 truncate">{policyFile.name}</p>}
              </div>
              <button type="button"
                onClick={() => { setPolicyFile(null); setParsed(false); setParseError(null) }}
                className="text-slate-400 hover:text-slate-600 flex-shrink-0"
                title="Remove and re-upload"
              ><X className="h-4 w-4" /></button>
            </div>
          )}
          {parseError && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {parseError}
            </p>
          )}

          {/* ── Party (named insured) ── */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-brand-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Named Insured (Party)</p>
            </div>
            <input type="text" className="form-input"
              placeholder="ABC General Contractors, Inc."
              {...register('party_name', { required: 'Named insured is required' })} />
            {errors.party_name && <p className="text-red-500 text-xs mt-1">{errors.party_name.message}</p>}
            {partyMatch ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="h-3 w-3" /> Will attach to existing party
                <span className="font-medium">"{partyMatch.name}"</span> on this matter.
              </p>
            ) : (watchedParty || '').trim() && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                <Sparkles className="h-3 w-3 text-brand-400" /> New party — will be added to this matter.
              </p>
            )}
          </div>

          {/* ── Insurer ── */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="h-3.5 w-3.5 text-brand-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Insurer (Carrier)</p>
            </div>
            <input type="text" className="form-input"
              placeholder="Travelers Indemnity Company"
              {...register('insurer_name', { required: 'Insurer name is required' })} />
            {errors.insurer_name && <p className="text-red-500 text-xs mt-1">{errors.insurer_name.message}</p>}
            {insurerHit ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle className="h-3 w-3" /> Will reuse existing insurer
                <span className="font-medium">"{insurerHit.name}"</span> from your Rolodex.
              </p>
            ) : (watchedInsurer || '').trim() && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                <Sparkles className="h-3 w-3 text-brand-400" /> New insurer — will be added to your Rolodex.
              </p>
            )}
          </div>

          {/* ── Policy fields ── */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="h-3.5 w-3.5 text-brand-500" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Policy Period</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-xs">Policy Number</label>
                <input type="text" className="form-input" placeholder="GL-2019-001234"
                  {...register('policy_number')} />
              </div>
              <div>
                <label className="form-label text-xs">Claim Number</label>
                <input type="text" className="form-input" placeholder="CLM-2024-009877"
                  {...register('claim_number')} />
              </div>
              <div>
                <label className="form-label text-xs">Coverage Start *</label>
                <input type="date" className="form-input"
                  {...register('policy_start', { required: 'Coverage start is required' })} />
                {errors.policy_start && <p className="text-red-500 text-xs mt-1">{errors.policy_start.message}</p>}
              </div>
              <div>
                <label className="form-label text-xs">Coverage End <span className="text-slate-400 font-normal">(blank = active)</span></label>
                <input type="date" className="form-input" {...register('policy_end')} />
              </div>
              <div className="col-span-2">
                <label className="form-label text-xs">Policy Limit ($)</label>
                <input type="number" step="0.01" min="0" className="form-input" placeholder="1000000"
                  {...register('policy_limit')} />
              </div>
            </div>
          </div>

          {/* ── Claims rep ── */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Claims Representative</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label text-xs">Name</label>
                <input type="text" className="form-input" placeholder="Jane Adjuster"
                  {...register('claims_rep_name')} />
              </div>
              <div>
                <label className="form-label text-xs">Email</label>
                <input type="email" className="form-input" placeholder="jane@carrier.com"
                  {...register('claims_rep_email')} />
              </div>
              <div className="col-span-2">
                <label className="form-label text-xs">Portal URL</label>
                <input type="url" className="form-input" placeholder="https://portal.carrier.com/claim/..."
                  {...register('portal_url')} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={handleClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1 justify-center">
              {isSubmitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><FolderOpen className="h-4 w-4" /> Add to Matter</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
