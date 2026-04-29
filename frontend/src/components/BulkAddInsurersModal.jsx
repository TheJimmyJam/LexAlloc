import { useState, useCallback, useRef, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Upload, Loader2, FileText, CheckCircle, AlertCircle, Sparkles,
  Trash2, ChevronDown, ChevronUp, Plus, RefreshCw, FolderOpen,
  Building2, Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { logAudit } from '../lib/audit.js'
import toast from 'react-hot-toast'

// ============================================================
// BulkAddInsurersModal
// Drop multiple policy PDFs at once. Each is uploaded + parsed in parallel.
// Once parsed, each row is editable. Submit-all creates all parties +
// insurers + policy periods in one pass, with within-batch dedup so two
// policies with the same named insured share one party row.
// ============================================================

// ── Concurrency limiter (mirrors BulkCreateMattersModal) ─────────────────────
async function runWithConcurrency(tasks, limit) {
  const pool = []
  for (const task of tasks) {
    const p = Promise.resolve().then(task).then(() => { pool.splice(pool.indexOf(p), 1) })
    pool.push(p)
    if (pool.length >= limit) await Promise.race(pool)
  }
  await Promise.all(pool)
}

function normalizeName(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STATUS_LABEL = {
  queued:    'Queued',
  uploading: 'Uploading…',
  parsing:   'AI parsing…',
  ready:     'Ready',
  saving:    'Saving…',
  saved:     'Saved',
  error:     'Error',
}

// ============================================================
export default function BulkAddInsurersModal({ matterId, parties = [], onClose }) {
  const { profile } = useAuth()
  const qc          = useQueryClient()
  const nextId      = useRef(0)

  const [queue,      setQueue]      = useState([])
  const [processing, setProcessing] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const update     = (id, patch) => setQueue(q => q.map(i => i.id === id ? { ...i, ...patch } : i))
  const removeItem = (id)        => setQueue(q => q.filter(i => i.id !== id))
  const editRow    = (id, field, val) =>
    setQueue(q => q.map(i => i.id === id ? { ...i, [field]: val } : i))

  // ── Per-file processing: upload + parse ───────────────────────────────────
  const processFile = async (item) => {
    const { id, file } = item

    update(id, { status: 'uploading' })
    const ext  = file.name.split('.').pop()
    const path = `policy-docs/${profile.org_id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('la_documents').upload(path, file, { upsert: true })
    if (upErr) { update(id, { status: 'error', error: upErr.message }); return }

    const { data: signed, error: signErr } = await supabase.storage
      .from('la_documents').createSignedUrl(path, 3600)
    if (signErr || !signed?.signedUrl) {
      update(id, { status: 'error', error: signErr?.message || 'Could not get signed URL' })
      return
    }

    update(id, { status: 'parsing', filePath: path })

    let parsed
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('parse-policy', {
        body: { fileUrl: signed.signedUrl, fileType: file.type || 'application/pdf' },
      })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      parsed = data
    } catch (err) {
      // Soft-fail: leave row editable so the user can fill it manually
      parsed = { _parseFailed: true }
      update(id, { error: err.message })
    }

    // Match parsed named insured against existing parties on this matter
    let partyId      = ''
    let newPartyName = ''
    let partyMode    = 'existing'                   // 'existing' | 'create_new'
    if (parsed?.named_insured) {
      const niNorm = normalizeName(parsed.named_insured)
      const match  = parties.find(p => normalizeName(p.name) === niNorm)
      if (match) {
        partyId   = match.id
        partyMode = 'existing'
      } else {
        partyMode    = 'create_new'
        newPartyName = parsed.named_insured
      }
    }

    update(id, {
      status:        'ready',
      parsed,
      partyMode,
      partyId,
      newPartyName,
      insurerName:   parsed?.insurer_name  || '',
      policyNumber:  parsed?.policy_number || '',
      policyStart:   parsed?.policy_start  || '',
      policyEnd:     parsed?.policy_end    || '',
      policyLimit:   parsed?.policy_limit ? String(parsed.policy_limit) : '',
      claimNumber:   parsed?.claim_number     || '',
      claimsRepName: parsed?.claims_rep_name  || '',
      claimsRepEmail:parsed?.claims_rep_email || '',
      portalUrl:     parsed?.portal_url       || '',
    })
  }

  // ── Drop handler ──────────────────────────────────────────────────────────
  const onDrop = useCallback(async (accepted) => {
    if (!accepted.length) return
    const newItems = accepted.map(file => ({
      id:           nextId.current++,
      file,
      status:       'queued',
      error:        null,
      parsed:       null,
      expanded:     false,
      partyMode:    'existing',
      partyId:      '',
      newPartyName: '',
      insurerName:  '',
      policyNumber: '',
      policyStart:  '',
      policyEnd:    '',
      policyLimit:  '',
      claimNumber:  '',
      claimsRepName:'',
      claimsRepEmail:'',
      portalUrl:    '',
    }))
    setQueue(q => [...q, ...newItems])
    setProcessing(true)
    await runWithConcurrency(newItems.map(item => () => processFile(item)), 3)
    setProcessing(false)
  }, [profile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg','.jpeg'], 'image/png': ['.png'] },
    disabled: submitting,
  })

  // ── Validation per row ────────────────────────────────────────────────────
  const rowError = (item) => {
    if (item.status !== 'ready') return null
    if (!item.insurerName.trim()) return 'Insurer name is required'
    if (!item.policyStart)        return 'Coverage start date is required'
    if (item.partyMode === 'existing' && !item.partyId)             return 'Pick an insured party'
    if (item.partyMode === 'create_new' && !item.newPartyName.trim()) return 'New party name is required'
    return null
  }

  const readyItems = queue.filter(i => i.status === 'ready')
  const validItems = readyItems.filter(i => !rowError(i))

  // ── Submit-all ────────────────────────────────────────────────────────────
  // Dedup parties by normalized name within-batch (so 3 policies for the same
  // named insured share one new party row), and reuse existing parties /
  // insurers from the org wherever names match.
  const submitAll = async () => {
    if (!validItems.length) return
    setSubmitting(true)

    // mark each as saving
    setQueue(q => q.map(i => validItems.some(v => v.id === i.id) ? { ...i, status: 'saving' } : i))

    // Pre-load existing insurers in the org so we can reuse by name
    const insurerNamesInBatch = [...new Set(validItems.map(i => i.insurerName.trim()))]
    let existingInsurersByKey = new Map()
    if (insurerNamesInBatch.length) {
      const { data: existing } = await supabase.from('la_insurers')
        .select('id, name')
        .eq('org_id', profile.org_id)
      for (const ins of (existing || [])) {
        existingInsurersByKey.set(normalizeName(ins.name), ins.id)
      }
    }

    // Cache for party creation (so 3 rows pointing at the same new party
    // collapse to 1 INSERT and share the new id).
    const newPartyIdByName  = new Map()
    const newInsurerIdByKey = new Map()

    let savedCount      = 0
    let createdParties  = 0
    let createdInsurers = 0
    let errorCount      = 0

    for (const item of validItems) {
      try {
        // 1. Resolve party id
        let partyId = item.partyId
        if (item.partyMode === 'create_new') {
          const partyName = item.newPartyName.trim()
          const key       = normalizeName(partyName)
          if (newPartyIdByName.has(key)) {
            partyId = newPartyIdByName.get(key)
          } else {
            const { data: newParty, error: pErr } = await supabase.from('la_parties').insert({
              matter_id:        matterId,
              org_id:           profile.org_id,
              name:             partyName,
              share_percentage: 0,
            }).select().single()
            if (pErr) throw new Error('party: ' + pErr.message)
            partyId = newParty.id
            newPartyIdByName.set(key, partyId)
            createdParties++
            logAudit({
              profile, matterId,
              action: 'party.added', entityType: 'party',
              entityId: partyId, entityName: partyName,
              metadata: { source: 'policy_upload', policy_file: item.file.name },
            })
          }
        }

        // 2. Resolve insurer id (existing in org → reuse; else create once per name in batch)
        const insurerKey = normalizeName(item.insurerName)
        let insurerId    = existingInsurersByKey.get(insurerKey) || newInsurerIdByKey.get(insurerKey)
        if (!insurerId) {
          const { data: newIns, error: iErr } = await supabase.from('la_insurers').insert({
            org_id:        profile.org_id,
            name:          item.insurerName.trim(),
            policy_number: item.policyNumber || null,
          }).select().single()
          if (iErr) throw new Error('insurer: ' + iErr.message)
          insurerId = newIns.id
          newInsurerIdByKey.set(insurerKey, insurerId)
          createdInsurers++
        }

        // 3. Insert the policy period linking insurer ↔ party on this matter
        const { error: ppErr } = await supabase.from('la_insurer_policy_periods').insert({
          insurer_id:       insurerId,
          party_id:         partyId,
          matter_id:        matterId,
          org_id:           profile.org_id,
          policy_start:     item.policyStart,
          policy_end:       item.policyEnd        || null,
          policy_limit:     item.policyLimit      ? parseFloat(item.policyLimit) : null,
          claim_number:     item.claimNumber      || null,
          claims_rep_name:  item.claimsRepName    || null,
          claims_rep_email: item.claimsRepEmail   || null,
          portal_url:       item.portalUrl        || null,
        })
        if (ppErr) throw new Error('policy_period: ' + ppErr.message)

        logAudit({
          profile, matterId,
          action: 'insurer.added', entityType: 'insurer',
          entityId: insurerId, entityName: item.insurerName.trim(),
          metadata: {
            source:       'bulk_policy_upload',
            policy_file:  item.file.name,
            policy_start: item.policyStart,
            policy_end:   item.policyEnd || null,
            policy_limit: item.policyLimit || null,
          },
        })

        update(item.id, { status: 'saved' })
        savedCount++
      } catch (err) {
        update(item.id, { status: 'error', error: err.message })
        errorCount++
      }
    }

    setSubmitting(false)
    qc.invalidateQueries({ queryKey: ['matter-insurers', matterId] })
    if (createdParties > 0) qc.invalidateQueries({ queryKey: ['matter-parties', matterId] })

    if (savedCount && !errorCount) {
      const partyMsg   = createdParties   ? ` · ${createdParties} new part${createdParties > 1 ? 'ies' : 'y'}`   : ''
      const insurerMsg = createdInsurers  ? ` · ${createdInsurers} new insurer${createdInsurers !== 1 ? 's' : ''}` : ''
      toast.success(`Added ${savedCount} polic${savedCount > 1 ? 'ies' : 'y'}${partyMsg}${insurerMsg}.`)
      // If everything saved, close.
      onClose()
    } else if (savedCount && errorCount) {
      toast.error(`${savedCount} saved, ${errorCount} failed — review the rows that errored.`)
    } else if (errorCount) {
      toast.error(`Could not save ${errorCount} polic${errorCount > 1 ? 'ies' : 'y'}.`)
    }
  }

  // ── Header counts ─────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    total:      queue.length,
    busy:       queue.filter(i => ['uploading','parsing','saving'].includes(i.status)).length,
    ready:      queue.filter(i => i.status === 'ready').length,
    valid:      validItems.length,
    saved:      queue.filter(i => i.status === 'saved').length,
    error:      queue.filter(i => i.status === 'error').length,
  }), [queue, validItems.length])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Add Insurers from Policy PDFs</h2>
            {queue.length === 0 ? (
              <p className="text-sm text-slate-400 mt-0.5">
                Drop one or more policy PDFs — each one becomes a party + insurer + policy period.
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                {counts.total} file{counts.total !== 1 ? 's' : ''}
                {counts.busy  > 0 && <span className="text-violet-500 font-medium"> · {counts.busy} processing</span>}
                {counts.ready > 0 && <span className="text-amber-600 font-medium"> · {counts.ready} ready</span>}
                {counts.saved > 0 && <span className="text-green-600 font-medium"> · {counts.saved} saved</span>}
                {counts.error > 0 && <span className="text-red-500 font-medium">  · {counts.error} failed</span>}
              </p>
            )}
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Drop zone */}
          <div className="p-6 border-b border-slate-100">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors
                ${queue.length > 0 ? 'p-4' : 'p-10'}
                ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}
            >
              <input {...getInputProps()} />
              {queue.length > 0 ? (
                <p className="text-sm text-slate-500">
                  <Upload className="inline h-4 w-4 mr-1.5 text-slate-400" />
                  Drop more policy PDFs to add to the queue
                </p>
              ) : (
                <>
                  <Upload className="text-slate-300 mx-auto mb-3 h-10 w-10" />
                  <p className="font-medium text-slate-700">Drop policy PDFs here</p>
                  <p className="text-sm text-slate-400 mt-1">Multiple files supported · PDF, PNG, JPG · AI extracts party + carrier + coverage</p>
                </>
              )}
            </div>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="divide-y divide-slate-100">
              {queue.map(item => (
                <QueueRow
                  key={item.id}
                  item={item}
                  parties={parties}
                  rowError={rowError(item)}
                  onUpdate={update}
                  onRemove={() => removeItem(item.id)}
                  onEdit={(field, val) => editRow(item.id, field, val)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-200 p-4 flex-shrink-0 flex items-center justify-between gap-3">
          <button onClick={onClose} className="btn-secondary">
            {counts.saved > 0 && counts.error === 0 && counts.busy === 0 ? 'Done' : 'Cancel'}
          </button>
          <div className="flex items-center gap-3">
            {counts.ready > 0 && counts.valid < counts.ready && (
              <span className="text-xs text-amber-600">
                {counts.ready - counts.valid} row{counts.ready - counts.valid !== 1 ? 's' : ''} need attention
              </span>
            )}
            <button
              onClick={submitAll}
              disabled={submitting || processing || counts.valid === 0}
              className="btn-primary"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : <><FolderOpen className="h-4 w-4" /> Save {counts.valid} Polic{counts.valid === 1 ? 'y' : 'ies'}</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}


// ============================================================
// One row in the queue — collapsed by default, expands for full detail edit.
// ============================================================
function QueueRow({ item, parties, rowError, onUpdate, onRemove, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const isProcessing = ['uploading','parsing','saving'].includes(item.status)
  const isReady      = item.status === 'ready'
  const isSaved      = item.status === 'saved'
  const isError      = item.status === 'error'

  const partyLabel = item.partyMode === 'create_new'
    ? `+ "${item.newPartyName.trim() || '(name required)'}"`
    : (parties.find(p => p.id === item.partyId)?.name || '(no party)')

  return (
    <div className={`px-6 py-3 ${isReady ? '' : isSaved ? 'bg-green-50/40' : isError ? 'bg-red-50/40' : ''}`}>
      <div className="flex items-center gap-3">

        <FileText className={`h-4 w-4 flex-shrink-0
          ${isSaved ? 'text-green-500' : isError ? 'text-red-500' : 'text-slate-300'}`}
        />

        <div className="w-44 flex-shrink-0 min-w-0">
          <p className="text-xs font-medium text-slate-700 truncate">{item.file.name}</p>
          <p className="text-xs text-slate-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB · {STATUS_LABEL[item.status]}</p>
        </div>

        {/* Inline summary (collapsed) */}
        {isReady && !expanded && (
          <div className="flex-1 min-w-0 flex items-center gap-2 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate font-medium text-slate-700">{item.insurerName || '(insurer required)'}</span>
            <span className="text-slate-300">·</span>
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span className="truncate">{partyLabel}</span>
            {item.policyStart && <>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-[11px] text-slate-400 truncate">
                {item.policyStart}{item.policyEnd ? ` → ${item.policyEnd}` : ' → active'}
              </span>
            </>}
          </div>
        )}

        {!isReady && !expanded && (
          <div className="flex-1 min-w-0 text-xs">
            {isProcessing && <span className="text-slate-400 italic">Processing…</span>}
            {isError     && <span className="text-red-500 truncate">{item.error}</span>}
            {isSaved     && <span className="text-green-600 font-medium">Saved to matter</span>}
          </div>
        )}

        <div className="flex items-center gap-1 flex-shrink-0">
          {isReady && rowError && !expanded && (
            <span className="flex items-center gap-1 text-xs text-amber-600 mr-1">
              <AlertCircle className="h-3.5 w-3.5" /> {rowError}
            </span>
          )}
          {(isReady || isError) && (
            <button onClick={() => setExpanded(e => !e)} className="p-1 text-slate-400 hover:text-slate-600" title={expanded ? 'Collapse' : 'Edit details'}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          {!isProcessing && !isSaved && (
            <button onClick={onRemove} className="p-1 text-slate-300 hover:text-red-500" title="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded edit area */}
      {expanded && (isReady || isError) && (
        <div className="mt-3 ml-7 bg-slate-50 rounded-lg p-4 border border-slate-200">
          {item.parsed?._parseFailed && (
            <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
              <span>AI couldn't parse this file — fill in the fields manually.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">

            {/* Party side */}
            <div className="col-span-2">
              <label className="form-label text-xs flex items-center gap-1.5">
                <Users className="h-3 w-3 text-brand-500" /> Insured Party *
                {item.parsed?.named_insured && item.partyMode === 'create_new' && (
                  <span className="text-[10px] font-normal text-emerald-600 inline-flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" /> from policy
                  </span>
                )}
              </label>
              <div className="flex items-center gap-2">
                <select
                  className="form-input text-sm py-1.5 flex-1"
                  value={item.partyMode === 'existing' ? item.partyId : '__new__'}
                  onChange={e => {
                    const v = e.target.value
                    if (v === '__new__') {
                      onEdit('partyMode', 'create_new')
                    } else {
                      onEdit('partyMode', 'existing')
                      onEdit('partyId', v)
                    }
                  }}
                >
                  <option value="">Select party…</option>
                  {parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="__new__">+ Create new party…</option>
                </select>
                {item.partyMode === 'create_new' && (
                  <input
                    type="text"
                    className="form-input text-sm py-1.5 flex-1"
                    placeholder="New party name"
                    value={item.newPartyName}
                    onChange={e => onEdit('newPartyName', e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Insurer */}
            <div className="col-span-2">
              <label className="form-label text-xs flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-brand-500" /> Insurer Name *
              </label>
              <input
                type="text"
                className="form-input text-sm py-1.5"
                placeholder="Travelers Indemnity Company"
                value={item.insurerName}
                onChange={e => onEdit('insurerName', e.target.value)}
              />
            </div>

            <div>
              <label className="form-label text-xs">Policy Number</label>
              <input type="text" className="form-input text-sm py-1.5"
                value={item.policyNumber} onChange={e => onEdit('policyNumber', e.target.value)} />
            </div>
            <div>
              <label className="form-label text-xs">Claim Number</label>
              <input type="text" className="form-input text-sm py-1.5"
                value={item.claimNumber} onChange={e => onEdit('claimNumber', e.target.value)} />
            </div>

            <div>
              <label className="form-label text-xs">Coverage Start *</label>
              <input type="date" className="form-input text-sm py-1.5"
                value={item.policyStart} onChange={e => onEdit('policyStart', e.target.value)} />
            </div>
            <div>
              <label className="form-label text-xs">Coverage End</label>
              <input type="date" className="form-input text-sm py-1.5"
                value={item.policyEnd} onChange={e => onEdit('policyEnd', e.target.value)} />
            </div>

            <div>
              <label className="form-label text-xs">Policy Limit ($)</label>
              <input type="number" step="0.01" min="0" className="form-input text-sm py-1.5"
                value={item.policyLimit} onChange={e => onEdit('policyLimit', e.target.value)} />
            </div>
            <div>
              <label className="form-label text-xs">Claims Rep Name</label>
              <input type="text" className="form-input text-sm py-1.5"
                value={item.claimsRepName} onChange={e => onEdit('claimsRepName', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="form-label text-xs">Claims Rep Email</label>
              <input type="email" className="form-input text-sm py-1.5"
                value={item.claimsRepEmail} onChange={e => onEdit('claimsRepEmail', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="form-label text-xs">Portal URL</label>
              <input type="url" className="form-input text-sm py-1.5"
                value={item.portalUrl} onChange={e => onEdit('portalUrl', e.target.value)} />
            </div>
          </div>

          {rowError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" /> {rowError}
            </p>
          )}
          {item.error && isError && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" /> {item.error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
