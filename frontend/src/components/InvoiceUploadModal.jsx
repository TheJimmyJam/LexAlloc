import { useState, useCallback, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDropzone } from 'react-dropzone'
import {
  X, Upload, Loader2, CheckCircle, AlertCircle, FileText,
  Trash2, ChevronDown, ChevronUp, Save, RefreshCw, Plus, RefreshCcw, AlertTriangle,
  Check, Square, CheckSquare, FolderSearch, Sparkles, Calculator,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'
import { APPORTIONMENT_METHODS, autoApportion } from '../lib/apportionment.js'
import { autoSendDemandLetters } from '../lib/autoSendDemandLetters.js'
import DateInput from './DateInput.jsx'
import toast from 'react-hot-toast'

// Short labels for the inline method picker
const METHOD_SHORT = {
  pro_rata_time_on_risk: 'TOR',
  equal_shares:          'Equal',
  limits_proportional:   'Limits',
}

// ── Concurrency-limited parallel processor ────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
  const results = []
  const pool    = []
  for (const task of tasks) {
    const p = Promise.resolve().then(task).then(r => { results.push(r); pool.splice(pool.indexOf(p), 1) })
    pool.push(p)
    if (pool.length >= limit) await Promise.race(pool)
  }
  await Promise.all(pool)
  return results
}

// ── Per-file step pipeline ────────────────────────────────────────────────────
// stages: queued → uploading → parsing → ready → saving → saved
//                                              ↘ error    (any stage)
//                                              ↘ dupe     (on save)
//                                              ↘ mismatch (on save — firm/matter # don't match)
const STEPS = [
  { key: 'upload', label: 'Upload',   active: ['uploading'],                    done: ['parsing','ready','saving','saved','dupe','mismatch'] },
  { key: 'parse',  label: 'AI Parse', active: ['parsing'],                      done: ['ready','saving','saved','dupe','mismatch'] },
  { key: 'review', label: 'Review',   active: ['ready','dupe','mismatch'],      done: ['saving','saved'] },
  { key: 'save',   label: 'Saved',    active: ['saving'],                       done: ['saved'] },
]

function StepPipeline({ status }) {
  const isError = status === 'error'

  return (
    <div className="flex items-center gap-0 flex-shrink-0">
      {STEPS.map((step, i) => {
        const isDone   = step.done.includes(status)
        const isActive = step.active.includes(status)
        const isPending = !isDone && !isActive && !isError

        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && (
              <div className={`h-px w-4 transition-colors ${isDone ? 'bg-brand-400' : 'bg-slate-200'}`} />
            )}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`
                w-6 h-6 rounded-full flex items-center justify-center transition-all
                ${isDone    ? 'bg-brand-500 text-white'             : ''}
                ${isActive  ? 'bg-brand-100 border-2 border-brand-400 text-brand-600' : ''}
                ${isPending ? 'bg-slate-100 border border-slate-200 text-slate-300' : ''}
                ${isError   ? 'bg-red-100 border border-red-200 text-red-400'       : ''}
              `}>
                {isDone    && <Check className="h-3 w-3" />}
                {isActive  && <Loader2 className="h-3 w-3 animate-spin" />}
                {isPending && <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />}
                {isError   && <AlertCircle className="h-3 w-3" />}
              </div>
              <span className={`text-[9px] font-medium leading-none whitespace-nowrap
                ${isDone    ? 'text-brand-600' : ''}
                ${isActive  ? 'text-brand-500' : ''}
                ${isPending ? 'text-slate-300' : ''}
                ${isError   ? 'text-red-400'   : ''}
              `}>
                {step.label}
              </span>
            </div>
          </div>
        )
      })}

      {isError && (
        <div className="ml-2 flex items-center gap-1 text-xs text-red-500 font-medium">
          <AlertCircle className="h-3.5 w-3.5" /> Failed
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
// matterId is OPTIONAL. When omitted, the modal matches the invoice to an
// existing matter (by matter_number) or creates a new one automatically.
export default function InvoiceUploadModal({ matterId, onClose, initialFiles = [] }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const [queue, setQueue]           = useState([])
  const [processing, setProcessing] = useState(false)
  const [selected, setSelected]     = useState(new Set())
  const nextId = useRef(0)

  const update = (id, patch) =>
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item))

  // ── Matter resolution ─────────────────────────────────────────────────────
  // Returns { id, name, firmName, matterNumber, isNew, defaultMethod }
  // When matterId prop is provided → always use that matter.
  // Otherwise → try to match on matter_number, else flag as new.
  const resolveMatter = async (parsed) => {
    if (matterId) {
      const { data } = await supabase
        .from('la_matters')
        .select('id, name, firm_name, matter_number, default_apportionment_method')
        .eq('id', matterId)
        .single()
      return {
        id:           matterId,
        name:         data?.name         || '',
        firmName:     data?.firm_name    || null,
        matterNumber: data?.matter_number || null,
        isNew:        false,
        defaultMethod: data?.default_apportionment_method || null,
      }
    }

    // Try to match by matter_number
    const parsedMatterNum = (parsed?.matter_number || '').trim()
    if (parsedMatterNum) {
      const { data: matches } = await supabase
        .from('la_matters')
        .select('id, name, firm_name, matter_number, default_apportionment_method')
        .eq('org_id', profile.org_id)
        .ilike('matter_number', parsedMatterNum)
        .limit(1)
      if (matches?.length) {
        const m = matches[0]
        return {
          id:           m.id,
          name:         m.name,
          firmName:     m.firm_name    || null,
          matterNumber: m.matter_number || null,
          isNew:        false,
          defaultMethod: m.default_apportionment_method || null,
        }
      }
    }

    // No match — will create a new matter on save
    const name =
      parsed?.client_name  ||
      parsed?.matter_name  ||
      (parsedMatterNum ? `Matter ${parsedMatterNum}` : null) ||
      parsed?.billing_firm ||
      'New Matter'
    return {
      id:           null,
      name,
      firmName:     parsed?.billing_firm || null,
      matterNumber: parsedMatterNum || null,
      isNew:        true,
      defaultMethod: null,
    }
  }

  // ── Process a single file: upload → AI parse → matter resolution ──────────
  const processFile = async (item) => {
    const { id, file } = item

    // 1. Upload
    update(id, { status: 'uploading' })
    const path = `${profile.org_id}/invoices/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('la_invoices')
      .upload(path, file, { contentType: file.type })
    if (uploadErr) { update(id, { status: 'error', error: uploadErr.message }); return }

    // 2. Get signed URL for edge function
    const { data: signedData, error: signedErr } = await supabase.storage
      .from('la_invoices')
      .createSignedUrl(path, 300)
    if (signedErr) { update(id, { status: 'error', error: signedErr.message }); return }

    const { data: { publicUrl } } = supabase.storage.from('la_invoices').getPublicUrl(path)

    // 3. AI parse
    update(id, { status: 'parsing' })
    let parsed
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', {
        body: { fileUrl: signedData.signedUrl, fileType: file.type },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      parsed = data
    } catch {
      parsed = {
        invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
        billing_firm: '', total_amount: 0,
        service_start: new Date().toISOString().split('T')[0],
        service_end:   new Date().toISOString().split('T')[0],
        line_items: [], _parseFailed: true,
      }
    }

    // 4. Resolve matter (match existing or flag for creation)
    let resolvedMatter = null
    try {
      resolvedMatter = await resolveMatter(parsed)
    } catch {
      // Fallback: use prop matterId if available, else flag as new
      resolvedMatter = {
        id: matterId || null, name: 'Unknown', firmName: null, matterNumber: null,
        isNew: !matterId, defaultMethod: null,
      }
    }

    update(id, {
      status:         'ready',
      fileUrl:        publicUrl,
      parsed:         { ...parsed, _fileUrl: publicUrl },
      expanded:       false,
      resolvedMatter,
      selectedMethod: null,
    })
    setSelected(s => new Set([...s, id]))
  }

  // ── Drop handler ──────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return
    const newItems = acceptedFiles.map(file => ({
      id:             nextId.current++,
      file,
      status:         'queued',
      error:          null,
      fileUrl:        null,
      parsed:         null,
      expanded:       false,
      resolvedMatter: null,
      selectedMethod: null,
    }))
    setQueue(q => [...q, ...newItems])
    setProcessing(true)
    await runWithConcurrency(newItems.map(item => () => processFile(item)), 3)
    setProcessing(false)
  }, [profile, matterId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxSize: 20 * 1024 * 1024,
  })

  // Pre-load files dropped from outside the modal (e.g. the invoices tab drag zone)
  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) onDrop(initialFiles)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save a single item ────────────────────────────────────────────────────
  const saveItem = async (item, force = false) => {
    const { id, parsed, fileUrl, resolvedMatter, selectedMethod } = item

    // Must have a method before saving
    const effectiveMethod = resolvedMatter?.defaultMethod || selectedMethod
    if (!effectiveMethod) {
      toast.error('Select an apportionment method before saving.')
      return
    }

    update(id, { status: 'saving' })
    try {
      // ── Dupe check ──────────────────────────────────────────────────────
      if (!force && parsed.invoice_number && parsed.billing_firm) {
        const { data: existing } = await supabase
          .from('la_invoices')
          .select('id, invoice_number, billing_firm, la_matters(name)')
          .eq('org_id', profile.org_id)
          .eq('invoice_number', parsed.invoice_number)
          .eq('billing_firm', parsed.billing_firm)
          .limit(1)
        if (existing?.length) {
          update(id, { status: 'dupe', dupeMatch: existing[0] })
          return
        }
      }

      // ── Mismatch check (only when opened from a specific matter) ────────
      if (matterId && !force && resolvedMatter) {
        const normalize = s => (s || '').toLowerCase().trim()
        const mismatches = {}
        if (resolvedMatter.firmName && parsed.billing_firm &&
            normalize(parsed.billing_firm) !== normalize(resolvedMatter.firmName)) {
          mismatches.firm = { invoiceValue: parsed.billing_firm, matterValue: resolvedMatter.firmName }
        }
        if (resolvedMatter.matterNumber && parsed.matter_number &&
            normalize(parsed.matter_number) !== normalize(resolvedMatter.matterNumber)) {
          mismatches.matter_number = { invoiceValue: parsed.matter_number, matterValue: resolvedMatter.matterNumber }
        }
        if (Object.keys(mismatches).length > 0) {
          update(id, { status: 'mismatch', mismatchData: mismatches })
          return
        }
      }

      // ── Resolve effective matter ID (create if new) ─────────────────────
      let effectiveMatterId = resolvedMatter?.id

      if (resolvedMatter?.isNew) {
        const { data: newMatter, error: mErr } = await supabase
          .from('la_matters')
          .insert({
            org_id:                       profile.org_id,
            name:                         resolvedMatter.name,
            matter_number:                resolvedMatter.matterNumber || null,
            firm_name:                    resolvedMatter.firmName     || null,
            status:                       'active',
            default_apportionment_method: effectiveMethod,
          })
          .select()
          .single()
        if (mErr) throw mErr
        effectiveMatterId = newMatter.id
      } else if (!resolvedMatter?.defaultMethod && effectiveMatterId) {
        // Existing matter with no method set — save it as the default now
        await supabase
          .from('la_matters')
          .update({ default_apportionment_method: effectiveMethod })
          .eq('id', effectiveMatterId)
      }

      // ── Save invoice ─────────────────────────────────────────────────────
      const { data: invoice, error: invErr } = await supabase
        .from('la_invoices')
        .insert({
          matter_id:      effectiveMatterId,
          org_id:         profile.org_id,
          file_url:       fileUrl,
          invoice_number: parsed.invoice_number,
          invoice_date:   parsed.invoice_date,
          billing_firm:   parsed.billing_firm,
          total_amount:   parseFloat(parsed.total_amount) || 0,
          service_start:  parsed.service_start,
          service_end:    parsed.service_end,
          status:         'parsed',
          parsed_data:    parsed,
        })
        .select()
        .single()
      if (invErr) throw invErr

      if (parsed.line_items?.length > 0) {
        const lineItems = parsed.line_items.map(li => ({
          invoice_id:      invoice.id,
          date_of_service: li.date || li.date_of_service,
          description:     li.description,
          timekeeper:      li.timekeeper,
          hours:           parseFloat(li.hours)  || null,
          rate:            parseFloat(li.rate)   || null,
          amount:          parseFloat(li.amount) || 0,
          category:        li.category || 'fees',
        }))
        await supabase.from('la_invoice_line_items').insert(lineItems)
      }

      // ── Run apportionment ────────────────────────────────────────────────
      let apportioned = false
      let apportId    = null
      if (parsed.service_start) {
        try {
          const apportResult = await autoApportion({
            invoiceId: invoice.id,
            invoice,
            matterId:  effectiveMatterId,
            orgId:     profile.org_id,
            profile,
            method:    effectiveMethod,
          })
          if (apportResult) {
            apportioned = true
            apportId    = apportResult
          }
        } catch { /* fall through — warn below */ }
      }

      // Invalidate all relevant caches so the UI reflects the new status immediately
      qc.invalidateQueries({ queryKey: ['matter-invoices', effectiveMatterId] })
      qc.invalidateQueries({ queryKey: ['matter-apportionments', effectiveMatterId] })
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })

      if (!apportioned) {
        toast('Invoice saved — apportionment skipped. Add parties & insurer periods to this matter, then re-run from the invoice.', {
          icon: '⚠️',
          duration: 8000,
          style: { maxWidth: '440px' },
        })
      }

      update(id, { status: 'saved', expanded: false })
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      api.sendEvent('invoice_parsed', profile.org_id, effectiveMatterId, {
        invoice_number: parsed.invoice_number,
        billing_firm:   parsed.billing_firm,
      }).catch(() => {})
      if (apportioned && apportId) {
        api.sendEvent('apportionment_run', profile.org_id, effectiveMatterId, {
          invoice_number:   parsed.invoice_number,
          method:           effectiveMethod,
          apportionment_id: apportId,
        }).catch(() => {})

        // Auto-generate and send demand letters — fire and forget
        autoSendDemandLetters({
          apportionmentId: apportId,
          orgName:         profile?.la_organizations?.name || '',
          download:        false,
        }).then(({ sent, skipped, errors, total }) => {
          if (total === 0) return
          if (errors.length > 0) {
            toast.error(`Demand letter email failed: ${errors[0].msg}`, { duration: 8000 })
          } else if (sent > 0) {
            const skipNote = skipped > 0 ? ` · ${skipped} skipped (no email on file)` : ''
            toast.success(`${total} demand letter${total !== 1 ? 's' : ''} sent to insurers${skipNote}`, { duration: 6000 })
          }
          // skipped-only case: no toast, tracked in DB silently
        }).catch(() => {})
      }
    } catch (err) {
      update(id, { status: 'error', error: err.message })
    }
  }

  // ── Save selected items ───────────────────────────────────────────────────
  const saveSelected = async () => {
    const toSave = queue.filter(i => i.status === 'ready' && selected.has(i.id))
    if (!toSave.length) return
    await Promise.all(toSave.map(item => saveItem(item)))
    toast.success(`${toSave.length} invoice${toSave.length !== 1 ? 's' : ''} saved!`)
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  const readyItems   = queue.filter(i => i.status === 'ready')
  const allSelected  = readyItems.length > 0 && readyItems.every(i => selected.has(i.id))
  const someSelected = readyItems.some(i => selected.has(i.id))

  const toggleSelect   = (id) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(s => { const n = new Set(s); readyItems.forEach(i => n.delete(i.id)); return n })
    } else {
      setSelected(s => new Set([...s, ...readyItems.map(i => i.id)]))
    }
  }

  const removeItem    = (id) => { setQueue(q => q.filter(i => i.id !== id)); setSelected(s => { const n = new Set(s); n.delete(id); return n }) }
  const retryItem     = (item) => { update(item.id, { status: 'queued', error: null }); processFile(item) }
  const toggleExpand  = (id) => update(id, { expanded: !queue.find(i => i.id === id)?.expanded })
  const editParsed    = (id, field, value) =>
    setQueue(q => q.map(i => i.id === id ? { ...i, parsed: { ...i.parsed, [field]: value } } : i))

  // ── Line item helpers ─────────────────────────────────────────────────────
  const editLineItem = (id, idx, field, value) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const items = [...(i.parsed?.line_items || [])]
      items[idx] = { ...items[idx], [field]: value }
      const newTotal = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      return { ...i, parsed: { ...i.parsed, line_items: items, total_amount: parseFloat(newTotal.toFixed(2)) } }
    }))

  const addLineItem = (id) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const items = [...(i.parsed?.line_items || []), {
        date_of_service: '', description: '', timekeeper: '',
        hours: '', rate: '', amount: '', category: 'fees',
      }]
      return { ...i, parsed: { ...i.parsed, line_items: items } }
    }))

  const deleteLineItem = (id, idx) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const items = (i.parsed?.line_items || []).filter((_, j) => j !== idx)
      const newTotal = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      return { ...i, parsed: { ...i.parsed, line_items: items, total_amount: parseFloat(newTotal.toFixed(2)) } }
    }))

  const syncTotalFromItems = (id) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const total = (i.parsed?.line_items || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      return { ...i, parsed: { ...i.parsed, total_amount: parseFloat(total.toFixed(2)) } }
    }))

  // ── Derived counts ────────────────────────────────────────────────────────
  const readyCount    = queue.filter(i => i.status === 'ready').length
  const savedCount    = queue.filter(i => i.status === 'saved').length
  const errorCount    = queue.filter(i => i.status === 'error').length
  const busyCount     = queue.filter(i => ['uploading','parsing','saving'].includes(i.status)).length
  const selectedCount = readyItems.filter(i => selected.has(i.id)).length
  const doneCount     = queue.filter(i => ['saved','error','dupe','mismatch'].includes(i.status)).length
  const allDone       = queue.length > 0 && queue.every(i => ['saved','error'].includes(i.status))
  const batchPct      = queue.length > 0 ? Math.round((doneCount / queue.length) * 100) : 0

  // An item needs a method selection when its matter has no default and the user hasn't picked one
  const needsMethod = (item) =>
    item.status === 'ready' && item.resolvedMatter && !item.resolvedMatter.defaultMethod && !item.selectedMethod

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg text-slate-900">Upload Invoices</h2>
            {queue.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-slate-400">
                  {queue.length} file{queue.length !== 1 ? 's' : ''}
                  {busyCount  > 0 && <span className="text-violet-500 font-medium"> · {busyCount} processing</span>}
                  {readyCount > 0 && <span className="text-amber-600 font-medium"> · {readyCount} ready</span>}
                  {savedCount > 0 && <span className="text-green-600 font-medium"> · {savedCount} saved</span>}
                  {errorCount > 0 && <span className="text-red-500 font-medium"> · {errorCount} failed</span>}
                </p>
                {(busyCount > 0 || doneCount > 0) && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500 rounded-full transition-all duration-500"
                        style={{ width: `${batchPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 w-10 text-right">{batchPct}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="ml-4 text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Drop zone ── */}
          <div className="p-6 border-b border-slate-100">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
                queue.length > 0 ? 'p-4' : 'p-12'
              } ${isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}
            >
              <input {...getInputProps()} />
              <Upload className={`text-slate-300 mx-auto mb-2 ${queue.length > 0 ? 'h-6 w-6' : 'h-10 w-10 mb-4'}`} />
              {queue.length > 0 ? (
                <p className="text-sm text-slate-500">Drop more files to add them to the queue</p>
              ) : (
                <>
                  <p className="font-medium text-slate-700">Drop invoice PDFs here</p>
                  <p className="text-sm text-slate-400 mt-1">
                    {matterId
                      ? 'Invoices will be saved to this matter'
                      : 'Invoices are matched to existing matters or a new matter is created'
                    }
                  </p>
                  <p className="text-xs text-slate-300 mt-1">PDF, PNG, JPG · max 20MB each · up to 3 parsed simultaneously</p>
                </>
              )}
            </div>
          </div>

          {/* ── Select-all bar (shown when ≥2 ready items) ── */}
          {readyItems.length >= 2 && (
            <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs font-medium text-amber-800 hover:text-amber-900"
              >
                {allSelected
                  ? <CheckSquare className="h-3.5 w-3.5 text-brand-500" />
                  : <Square className="h-3.5 w-3.5 text-slate-400" />
                }
                {allSelected ? 'Deselect All' : 'Select All'} ready invoices
              </button>
              {someSelected && (
                <span className="text-xs text-amber-700">
                  {selectedCount} of {readyItems.length} selected
                </span>
              )}
            </div>
          )}

          {/* ── Queue ── */}
          {queue.length > 0 && (
            <div className="divide-y divide-slate-100">
              {queue.map(item => (
                <div key={item.id}>
                  {/* ── Row summary ── */}
                  <div className={`flex items-start gap-3 px-6 py-3 transition-colors ${
                    item.status === 'ready' && selected.has(item.id) ? 'bg-brand-50/40' : 'hover:bg-slate-50'
                  }`}>

                    {/* Checkbox (ready items only) */}
                    <div className="flex-shrink-0 mt-0.5">
                      {item.status === 'ready' ? (
                        <button
                          onClick={() => toggleSelect(item.id)}
                          className="text-slate-400 hover:text-brand-600 transition-colors"
                          title={selected.has(item.id) ? 'Deselect' : 'Select for batch save'}
                        >
                          {selected.has(item.id)
                            ? <CheckSquare className="h-4 w-4 text-brand-500" />
                            : <Square className="h-4 w-4" />
                          }
                        </button>
                      ) : (
                        <FileText className="h-4 w-4 text-slate-300" />
                      )}
                    </div>

                    {/* File name + size + matter badge */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.file.name}</p>
                      <p className="text-xs text-slate-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>

                      {/* Matter resolution badge */}
                      {item.resolvedMatter && (item.status === 'ready' || item.status === 'saving' || item.status === 'saved') && (
                        <div className="flex items-center gap-1 mt-1">
                          {item.resolvedMatter.isNew ? (
                            <>
                              <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              <span className="text-xs text-amber-600 font-medium truncate">
                                New matter: {item.resolvedMatter.name}
                              </span>
                            </>
                          ) : (
                            <>
                              <FolderSearch className="h-3 w-3 text-green-600 flex-shrink-0" />
                              <span className="text-xs text-green-700 font-medium truncate">
                                {item.resolvedMatter.name}
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      {/* Inline method picker — shown when matter has no default */}
                      {needsMethod(item) && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-xs text-amber-700 font-medium">Set method:</span>
                          {APPORTIONMENT_METHODS.map(m => (
                            <button
                              key={m.value}
                              onClick={() => update(item.id, { selectedMethod: m.value })}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                item.selectedMethod === m.value
                                  ? 'bg-brand-600 text-white border-brand-600'
                                  : 'border-slate-300 text-slate-600 hover:border-brand-400 hover:text-brand-600'
                              }`}
                            >
                              {METHOD_SHORT[m.value]}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Confirmed method (when selected) */}
                      {item.status === 'ready' && item.resolvedMatter && !item.resolvedMatter.defaultMethod && item.selectedMethod && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <Check className="h-3 w-3 text-brand-500" />
                          <span className="text-xs text-brand-600 font-medium">
                            {APPORTIONMENT_METHODS.find(m => m.value === item.selectedMethod)?.label}
                            {' '}&mdash; will be set as matter default
                          </span>
                          <button
                            onClick={() => update(item.id, { selectedMethod: null })}
                            className="text-slate-300 hover:text-slate-500 ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}

                      {/* Method from matter default */}
                      {item.status === 'ready' && item.resolvedMatter?.defaultMethod && (
                        <div className="flex items-center gap-1 mt-1">
                          <Check className="h-3 w-3 text-green-500" />
                          <span className="text-xs text-slate-500">
                            {APPORTIONMENT_METHODS.find(m => m.value === item.resolvedMatter.defaultMethod)?.label} (matter default)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right side: parsed summary + status */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {/* Parsed summary */}
                      {(item.status === 'ready' || item.status === 'saved') && item.parsed && (
                        <div className="hidden md:flex items-center gap-3 text-xs text-slate-500">
                          {item.parsed.invoice_number && <span className="font-mono">#{item.parsed.invoice_number}</span>}
                          {item.parsed.total_amount   && <span className="font-semibold text-slate-700">${parseFloat(item.parsed.total_amount).toLocaleString()}</span>}
                          {item.parsed.line_items?.length > 0 && <span>{item.parsed.line_items.length} lines</span>}
                          {item.parsed._parseFailed && <span className="text-amber-600">Manual entry needed</span>}
                        </div>
                      )}

                      {item.status === 'error' && (
                        <p className="text-xs text-red-500 max-w-xs truncate">{item.error}</p>
                      )}

                      {item.status === 'dupe' && item.dupeMatch && (
                        <p className="text-xs text-amber-700 max-w-xs truncate">
                          Duplicate of #{item.dupeMatch.invoice_number}
                          {item.dupeMatch.la_matters?.name ? ` on "${item.dupeMatch.la_matters.name}"` : ''}
                        </p>
                      )}

                      {item.status === 'mismatch' && item.mismatchData && (
                        <div className="text-xs text-orange-700 max-w-xs space-y-0.5">
                          {item.mismatchData.firm && (
                            <p className="truncate">Firm mismatch: "{item.mismatchData.firm.invoiceValue}" ≠ "{item.mismatchData.firm.matterValue}"</p>
                          )}
                          {item.mismatchData.matter_number && (
                            <p className="truncate">Matter # mismatch: "{item.mismatchData.matter_number.invoiceValue}" ≠ "{item.mismatchData.matter_number.matterValue}"</p>
                          )}
                        </div>
                      )}

                      {/* Step pipeline */}
                      <StepPipeline status={item.status} />

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {item.status === 'dupe' && (
                          <button
                            onClick={() => saveItem(item, true)}
                            className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition-colors"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Save Anyway
                          </button>
                        )}
                        {item.status === 'mismatch' && (
                          <button
                            onClick={() => saveItem(item, true)}
                            className="flex items-center gap-1 text-xs font-medium text-orange-700 hover:text-orange-900 bg-orange-50 hover:bg-orange-100 px-2 py-1 rounded-lg transition-colors"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Save Anyway
                          </button>
                        )}
                        {item.status === 'ready' && (
                          <>
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title={item.expanded ? 'Collapse' : 'Review / Edit'}
                            >
                              {item.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => saveItem(item)}
                              disabled={needsMethod(item)}
                              className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                                needsMethod(item)
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100'
                              }`}
                              title={needsMethod(item) ? 'Choose an apportionment method first' : 'Run apportionment and save invoice'}
                            >
                              <Calculator className="h-3.5 w-3.5" /> Apportion & Save
                            </button>
                          </>
                        )}
                        {item.status === 'error' && (
                          <button onClick={() => retryItem(item)} className="p-1 text-slate-400 hover:text-brand-600" title="Retry">
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        {!['uploading','parsing','saving'].includes(item.status) && (
                          <button onClick={() => removeItem(item.id)} className="p-1 text-slate-300 hover:text-red-500" title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── Expanded edit form ── */}
                  {item.expanded && item.status === 'ready' && item.parsed && (
                    <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                      {item.parsed._parseFailed && (
                        <div className="py-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 my-3">
                          ⚠ AI couldn't parse this file automatically — please fill in the fields below.
                        </div>
                      )}

                      {/* Matter name editor (for new matters or when no matterId prop) */}
                      {!matterId && item.resolvedMatter && (
                        <div className="mt-3 mb-1">
                          <label className="form-label text-xs">
                            {item.resolvedMatter.isNew ? 'New Matter Name' : 'Matched Matter'}
                          </label>
                          {item.resolvedMatter.isNew ? (
                            <input
                              type="text"
                              className="form-input text-sm py-1.5"
                              value={item.resolvedMatter.name}
                              onChange={e => setQueue(q => q.map(i =>
                                i.id === item.id
                                  ? { ...i, resolvedMatter: { ...i.resolvedMatter, name: e.target.value } }
                                  : i
                              ))}
                              placeholder="Matter name"
                            />
                          ) : (
                            <p className="form-input text-sm py-1.5 bg-slate-100 text-slate-600 cursor-default">
                              {item.resolvedMatter.name}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3 pt-3">
                        {[
                          { label: 'Invoice Number', field: 'invoice_number', type: 'text' },
                          { label: 'Invoice Date',   field: 'invoice_date',   type: 'date' },
                          { label: 'Billing Firm',   field: 'billing_firm',   type: 'text' },
                          { label: 'Total Amount',   field: 'total_amount',   type: 'number' },
                          { label: 'Service Start',  field: 'service_start',  type: 'date' },
                          { label: 'Service End',    field: 'service_end',    type: 'date' },
                        ].map(({ label, field, type }) => (
                          <div key={field}>
                            <label className="form-label text-xs">{label}</label>
                            {type === 'date' ? (
                              <DateInput
                                value={item.parsed[field] || ''}
                                onChange={v => editParsed(item.id, field, v)}
                                className="w-full"
                              />
                            ) : (
                              <input
                                type={type}
                                step={type === 'number' ? '0.01' : undefined}
                                className="form-input text-sm py-1.5"
                                value={item.parsed[field] || ''}
                                onChange={e => editParsed(item.id, field, e.target.value)}
                              />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* ── Line Items Editor ── */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                            Line Items
                            {item.parsed.line_items?.length > 0 && (
                              <span className="ml-2 font-normal text-slate-400 normal-case">
                                {item.parsed.line_items.length} row{item.parsed.line_items.length !== 1 ? 's' : ''}
                                {' · '}
                                total ${(item.parsed.line_items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </p>
                          <div className="flex items-center gap-2">
                            {item.parsed.line_items?.length > 0 && (
                              <button
                                type="button"
                                onClick={() => syncTotalFromItems(item.id)}
                                className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1"
                                title="Recalculate invoice total from line item amounts"
                              >
                                <RefreshCcw className="h-3 w-3" /> Sync total
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => addLineItem(item.id)}
                              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg transition-colors"
                            >
                              <Plus className="h-3 w-3" /> Add Row
                            </button>
                          </div>
                        </div>

                        {(!item.parsed.line_items || item.parsed.line_items.length === 0) ? (
                          <div className="text-center py-4 border border-dashed border-slate-200 rounded-lg">
                            <p className="text-xs text-slate-400">No line items — click Add Row to enter them manually.</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-100 border-b border-slate-200">
                                  <th className="text-left font-semibold text-slate-500 px-2 py-1.5 w-24">Date</th>
                                  <th className="text-left font-semibold text-slate-500 px-2 py-1.5">Description</th>
                                  <th className="text-left font-semibold text-slate-500 px-2 py-1.5 w-24">Timekeeper</th>
                                  <th className="text-right font-semibold text-slate-500 px-2 py-1.5 w-14">Hours</th>
                                  <th className="text-right font-semibold text-slate-500 px-2 py-1.5 w-18">Rate</th>
                                  <th className="text-right font-semibold text-slate-500 px-2 py-1.5 w-20">Amount</th>
                                  <th className="text-left font-semibold text-slate-500 px-2 py-1.5 w-20">Category</th>
                                  <th className="w-6" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {item.parsed.line_items.map((li, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 group">
                                    <td className="px-1 py-1">
                                      <DateInput
                                        value={li.date_of_service || li.date || ''}
                                        onChange={v => editLineItem(item.id, idx, 'date_of_service', v)}
                                        className="w-full text-xs"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <input
                                        type="text"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none min-w-0"
                                        value={li.description || ''}
                                        onChange={e => editLineItem(item.id, idx, 'description', e.target.value)}
                                        placeholder="Description"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <input
                                        type="text"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                        value={li.timekeeper || ''}
                                        onChange={e => editLineItem(item.id, idx, 'timekeeper', e.target.value)}
                                        placeholder="Name"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <input
                                        type="number"
                                        step="0.1"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none text-right"
                                        value={li.hours || ''}
                                        onChange={e => editLineItem(item.id, idx, 'hours', e.target.value)}
                                        placeholder="0.0"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none text-right"
                                        value={li.rate || ''}
                                        onChange={e => editLineItem(item.id, idx, 'rate', e.target.value)}
                                        placeholder="0.00"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <input
                                        type="number"
                                        step="0.01"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none text-right font-semibold"
                                        value={li.amount || ''}
                                        onChange={e => editLineItem(item.id, idx, 'amount', e.target.value)}
                                        placeholder="0.00"
                                      />
                                    </td>
                                    <td className="px-1 py-1">
                                      <select
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                        value={li.category || 'fees'}
                                        onChange={e => editLineItem(item.id, idx, 'category', e.target.value)}
                                      >
                                        <option value="fees">Fees</option>
                                        <option value="costs">Costs</option>
                                        <option value="expenses">Expenses</option>
                                        <option value="other">Other</option>
                                      </select>
                                    </td>
                                    <td className="px-1 py-1 text-center">
                                      <button
                                        type="button"
                                        onClick={() => deleteLineItem(item.id, idx)}
                                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-0.5 rounded"
                                        title="Delete row"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="border-t-2 border-slate-200 bg-slate-50">
                                  <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold text-slate-500">Total</td>
                                  <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-800">
                                    ${(item.parsed.line_items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td colSpan={2} />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-200 p-4 flex-shrink-0 flex items-center justify-between gap-3">
          <button onClick={onClose} className="btn-secondary">
            {allDone ? 'Done' : 'Cancel'}
          </button>

          {queue.length > 0 && (
            <div className="flex items-center gap-3">
              {selectedCount > 0 && (
                <button
                  onClick={saveSelected}
                  disabled={processing || readyItems.filter(i => selected.has(i.id)).some(needsMethod)}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Calculator className="h-4 w-4" />
                  Apportion & Save Selected ({selectedCount})
                </button>
              )}
              {selectedCount === 0 && readyCount === 1 && (() => {
                const single = queue.find(i => i.status === 'ready')
                return (
                  <button
                    onClick={() => saveItem(single)}
                    disabled={needsMethod(single)}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Calculator className="h-4 w-4" /> Apportion & Save Invoice
                  </button>
                )
              })()}
              {readyCount === 0 && savedCount > 0 && errorCount === 0 && (
                <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4" /> All invoices saved
                </span>
              )}
            </div>
          )}

          {queue.length === 0 && (
            <p className="text-sm text-slate-400">Drop files above to get started</p>
          )}
        </div>
      </div>
    </div>
  )
}
