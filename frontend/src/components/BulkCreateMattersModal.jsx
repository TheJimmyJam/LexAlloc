import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Upload, Loader2, FileText, CheckCircle, AlertCircle,
  FolderOpen, Trash2, ChevronDown, ChevronUp, Save,
  RefreshCw, Plus, RefreshCcw, AlertTriangle,
  Check, Square, CheckSquare,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'
import { logAudit } from '../lib/audit.js'
import toast from 'react-hot-toast'

// ── Concurrency limiter ───────────────────────────────────────────────────────
async function runWithConcurrency(tasks, limit) {
  const pool = []
  for (const task of tasks) {
    const p = Promise.resolve().then(task).then(() => { pool.splice(pool.indexOf(p), 1) })
    pool.push(p)
    if (pool.length >= limit) await Promise.race(pool)
  }
  await Promise.all(pool)
}

// ── Matter-grouping helpers ───────────────────────────────────────────────────
// Multiple invoices for the SAME matter should produce ONE matter with N
// invoices attached — not N duplicate matters. We compute a stable fingerprint
// per item so the batch creator can group items before any DB writes.
function normalizeMatterKey(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')   // keep alphanumerics, spaces, hyphens
    .replace(/\s+/g, ' ')
    .trim()
}

// Priority: matter_number (cause/docket #) → matter_name. Items missing both
// fall back to a per-item key so they never collide with anything else.
function matterFingerprint(item) {
  const num  = normalizeMatterKey(item.matterNumber)
  const name = normalizeMatterKey(item.matterName)
  if (num)  return `mn:${num}`
  if (name) return `nm:${name}`
  return `id:${item.id}`
}

// ── Step pipeline ─────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'upload',  label: 'Upload',   active: ['uploading'],                  done: ['parsing','ready','creating','created','dupe'] },
  { key: 'parse',   label: 'AI Parse', active: ['parsing'],                    done: ['ready','creating','created','dupe'] },
  { key: 'review',  label: 'Review',   active: ['ready','dupe'],               done: ['creating','created'] },
  { key: 'created', label: 'Created',  active: ['creating'],                   done: ['created'] },
]

function StepPipeline({ status }) {
  const isError = status === 'error'
  return (
    <div className="flex items-center gap-0 flex-shrink-0">
      {STEPS.map((step, i) => {
        const isDone    = step.done.includes(status)
        const isActive  = step.active.includes(status)
        const isPending = !isDone && !isActive && !isError
        return (
          <div key={step.key} className="flex items-center">
            {i > 0 && <div className={`h-px w-4 transition-colors ${isDone ? 'bg-brand-400' : 'bg-slate-200'}`} />}
            <div className="flex flex-col items-center gap-0.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all
                ${isDone    ? 'bg-brand-500 text-white'                          : ''}
                ${isActive  ? 'bg-brand-100 border-2 border-brand-400 text-brand-600' : ''}
                ${isPending ? 'bg-slate-100 border border-slate-200 text-slate-300'   : ''}
                ${isError   ? 'bg-red-100 border border-red-200 text-red-400'         : ''}
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
              `}>{step.label}</span>
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
export default function BulkCreateMattersModal({ onClose }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const qc          = useQueryClient()
  const nextId      = useRef(0)

  const [queue,      setQueue]      = useState([])
  const [processing, setProcessing] = useState(false)
  const [selected,   setSelected]   = useState(new Set())

  const update = (id, patch) =>
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item))

  // ── Per-item process: upload → AI parse ──────────────────────────────────
  const processFile = async (item) => {
    const { id, file } = item

    update(id, { status: 'uploading' })
    const path = `${profile.org_id}/invoices/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage
      .from('la_invoices')
      .upload(path, file, { contentType: file.type })
    if (uploadErr) { update(id, { status: 'error', error: uploadErr.message }); return }

    const { data: signedData, error: signedErr } = await supabase.storage
      .from('la_invoices').createSignedUrl(path, 300)
    if (signedErr) { update(id, { status: 'error', error: signedErr.message }); return }

    const { data: { publicUrl } } = supabase.storage.from('la_invoices').getPublicUrl(path)

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

    // Pre-seed matter fields from parsed data
    const matterName   = parsed.matter_name   || ''
    const matterNumber = parsed.matter_number || ''
    const firmName     = parsed.billing_firm  || ''

    update(id, {
      status: 'ready',
      fileUrl: publicUrl,
      parsed:  { ...parsed, _fileUrl: publicUrl },
      matterName,
      matterNumber,
      firmName,
      description: '',
      expanded: false,
      dupeWarnings: null,
    })
    setSelected(s => new Set([...s, id]))
  }

  // ── Drop handler ──────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return
    const newItems = acceptedFiles.map(file => ({
      id: nextId.current++, file,
      status: 'queued', error: null, fileUrl: null,
      parsed: null, expanded: false,
      matterName: '', matterNumber: '', firmName: '', description: '',
      dupeWarnings: null,
    }))
    setQueue(q => [...q, ...newItems])
    setProcessing(true)
    await runWithConcurrency(newItems.map(item => () => processFile(item)), 3)
    setProcessing(false)
  }, [profile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxSize: 20 * 1024 * 1024,
  })

  // ── Create a single matter + invoice ──────────────────────────────────────
  // Returns { matterId } on success, or null on dupe/error/missing-name so the
  // batch creator knows whether to keep grouping more invoices onto it.
  const createItem = async (item, force = false) => {
    const { id, parsed, fileUrl, matterName, matterNumber, firmName, description } = item
    if (!matterName.trim()) {
      update(id, { error: 'Matter name is required', status: 'ready' })
      return null
    }

    // Dupe check (skip when force = true)
    if (!force) {
      const warnings = []
      if (matterNumber.trim()) {
        const { data: dm } = await supabase.from('la_matters')
          .select('id, name, matter_number')
          .eq('org_id', profile.org_id).eq('matter_number', matterNumber.trim()).limit(1)
        if (dm?.length) warnings.push({ type: 'matter_number', match: dm[0] })
      }
      if (!warnings.length) {
        const { data: dn } = await supabase.from('la_matters')
          .select('id, name').eq('org_id', profile.org_id).ilike('name', matterName.trim()).limit(1)
        if (dn?.length) warnings.push({ type: 'matter_name', match: dn[0] })
      }
      if (parsed?.invoice_number && parsed?.billing_firm) {
        const { data: di } = await supabase.from('la_invoices')
          .select('id, invoice_number, billing_firm, la_matters(name)')
          .eq('org_id', profile.org_id)
          .eq('invoice_number', parsed.invoice_number)
          .eq('billing_firm', parsed.billing_firm).limit(1)
        if (di?.length) warnings.push({ type: 'invoice', match: di[0] })
      }
      if (warnings.length) {
        update(id, { status: 'dupe', dupeWarnings: warnings })
        return null
      }
    }

    update(id, { status: 'creating', dupeWarnings: null })
    try {
      const { data: newMatter, error: mErr } = await supabase
        .from('la_matters').insert({
          org_id:        profile.org_id,
          name:          matterName.trim(),
          matter_number: matterNumber.trim() || null,
          firm_name:     firmName.trim()     || null,
          description:   description.trim()  || null,
          status:        'active',
          created_by:    profile.id,
          is_template:   false,
        }).select().single()
      if (mErr) throw mErr

      logAudit({
        profile, matterId: newMatter.id,
        action: 'matter.created', entityType: 'matter',
        entityId: newMatter.id, entityName: matterName.trim(),
        metadata: { created_from_invoice: true, bulk: true },
      })

      const { data: invoice, error: invErr } = await supabase
        .from('la_invoices').insert({
          matter_id:      newMatter.id,
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
        }).select().single()
      if (invErr) throw invErr

      if (parsed.line_items?.length > 0) {
        await supabase.from('la_invoice_line_items').insert(
          parsed.line_items.map(li => ({
            invoice_id:      invoice.id,
            date_of_service: li.date || li.date_of_service,
            description:     li.description,
            timekeeper:      li.timekeeper,
            hours:           parseFloat(li.hours)  || null,
            rate:            parseFloat(li.rate)   || null,
            amount:          parseFloat(li.amount) || 0,
            category:        li.category || 'fees',
          }))
        )
      }

      api.sendEvent('invoice_parsed', profile.org_id, newMatter.id, {
        invoice_number: parsed.invoice_number,
        billing_firm:   parsed.billing_firm,
      }).catch(() => {})

      update(id, { status: 'created', matterId: newMatter.id, expanded: false })
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
      return { matterId: newMatter.id }
    } catch (err) {
      update(id, { status: 'error', error: err.message })
      return null
    }
  }

  // ── Attach an invoice to a matter that already exists (e.g. one that was
  // just created earlier in the same batch). No new matter row — invoice +
  // line items only.
  const attachInvoice = async (item, matterId) => {
    const { id, parsed, fileUrl } = item
    update(id, { status: 'creating', dupeWarnings: null })
    try {
      const { data: invoice, error: invErr } = await supabase
        .from('la_invoices').insert({
          matter_id:      matterId,
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
        }).select().single()
      if (invErr) throw invErr

      if (parsed.line_items?.length > 0) {
        await supabase.from('la_invoice_line_items').insert(
          parsed.line_items.map(li => ({
            invoice_id:      invoice.id,
            date_of_service: li.date || li.date_of_service,
            description:     li.description,
            timekeeper:      li.timekeeper,
            hours:           parseFloat(li.hours)  || null,
            rate:            parseFloat(li.rate)   || null,
            amount:          parseFloat(li.amount) || 0,
            category:        li.category || 'fees',
          }))
        )
      }

      api.sendEvent('invoice_parsed', profile.org_id, matterId, {
        invoice_number: parsed.invoice_number,
        billing_firm:   parsed.billing_firm,
      }).catch(() => {})

      update(id, { status: 'created', matterId, expanded: false })
      setSelected(s => { const n = new Set(s); n.delete(id); return n })
      qc.invalidateQueries({ queryKey: ['matters'] })
      return { matterId }
    } catch (err) {
      update(id, { status: 'error', error: err.message })
      return null
    }
  }

  // ── Create all selected ready items ───────────────────────────────────────
  // Group items by matter fingerprint so multiple invoices for the SAME matter
  // produce ONE matter with N invoices attached, instead of N duplicate matters.
  const createSelected = async () => {
    const toCreate = queue.filter(
      i => i.status === 'ready' && selected.has(i.id) && i.matterName.trim()
    )
    if (!toCreate.length) return

    // Build groups: one entry per unique matter fingerprint, in original order.
    const groups = new Map()
    for (const item of toCreate) {
      const fp = matterFingerprint(item)
      if (!groups.has(fp)) groups.set(fp, [])
      groups.get(fp).push(item)
    }

    let mattersCreated   = 0
    let invoicesAttached = 0

    // Sequential per group: first item creates the matter, the rest attach to it.
    for (const items of groups.values()) {
      const [first, ...rest] = items
      const result = await createItem(first)
      if (!result?.matterId) continue   // dupe / error / aborted — skip group
      mattersCreated++
      invoicesAttached++
      for (const item of rest) {
        const r = await attachInvoice(item, result.matterId)
        if (r?.matterId) invoicesAttached++
      }
    }

    if (mattersCreated > 0 || invoicesAttached > 0) {
      const matterPart  = `${mattersCreated} matter${mattersCreated !== 1 ? 's' : ''} created`
      const invoicePart = invoicesAttached !== mattersCreated
        ? ` · ${invoicesAttached} invoice${invoicesAttached !== 1 ? 's' : ''} attached`
        : ''
      toast.success(matterPart + invoicePart)
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  const readyItems    = queue.filter(i => i.status === 'ready')
  const allSelected   = readyItems.length > 0 && readyItems.every(i => selected.has(i.id))
  const selectedCount = readyItems.filter(i => selected.has(i.id)).length

  const toggleSelect    = (id) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => {
    if (allSelected) setSelected(s => { const n = new Set(s); readyItems.forEach(i => n.delete(i.id)); return n })
    else             setSelected(s => new Set([...s, ...readyItems.map(i => i.id)]))
  }

  const removeItem   = (id) => { setQueue(q => q.filter(i => i.id !== id)); setSelected(s => { const n = new Set(s); n.delete(id); return n }) }
  const retryItem    = (item) => { update(item.id, { status: 'queued', error: null, dupeWarnings: null }); processFile(item) }
  const toggleExpand = (id)  => update(id, { expanded: !queue.find(i => i.id === id)?.expanded })

  const editField    = (id, field, val) => setQueue(q => q.map(i => i.id === id ? { ...i, [field]: val } : i))
  const editParsed   = (id, field, val) => setQueue(q => q.map(i => i.id === id ? { ...i, parsed: { ...i.parsed, [field]: val } } : i))
  const editLineItem = (id, idx, field, val) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const items = [...(i.parsed?.line_items || [])]
      items[idx] = { ...items[idx], [field]: val }
      const total = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      return { ...i, parsed: { ...i.parsed, line_items: items, total_amount: parseFloat(total.toFixed(2)) } }
    }))
  const addLineItem    = (id) => setQueue(q => q.map(i => i.id !== id ? i : { ...i, parsed: { ...i.parsed, line_items: [...(i.parsed?.line_items || []), { date_of_service: '', description: '', timekeeper: '', hours: '', rate: '', amount: '', category: 'fees' }] } }))
  const deleteLineItem = (id, idx) => setQueue(q => q.map(i => {
    if (i.id !== id) return i
    const items = (i.parsed?.line_items || []).filter((_, j) => j !== idx)
    const total = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
    return { ...i, parsed: { ...i.parsed, line_items: items, total_amount: parseFloat(total.toFixed(2)) } }
  }))
  const syncTotal = (id) => setQueue(q => q.map(i => {
    if (i.id !== id) return i
    const total = (i.parsed?.line_items || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
    return { ...i, parsed: { ...i.parsed, total_amount: parseFloat(total.toFixed(2)) } }
  }))

  // ── Derived counts ────────────────────────────────────────────────────────
  const readyCount   = queue.filter(i => i.status === 'ready').length
  const createdCount = queue.filter(i => i.status === 'created').length
  const errorCount   = queue.filter(i => i.status === 'error').length
  const busyCount    = queue.filter(i => ['uploading','parsing','creating'].includes(i.status)).length
  const doneCount    = queue.filter(i => ['created','error','dupe'].includes(i.status)).length
  const batchPct     = queue.length > 0 ? Math.round((doneCount / queue.length) * 100) : 0
  const allDone      = queue.length > 0 && queue.every(i => ['created','error'].includes(i.status))

  const createdIds = queue.filter(i => i.status === 'created' && i.matterId).map(i => i.matterId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-lg text-slate-900">Create Matters from Invoices</h2>
            {queue.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-slate-400">
                  {queue.length} file{queue.length !== 1 ? 's' : ''}
                  {busyCount   > 0 && <span className="text-violet-500 font-medium"> · {busyCount} processing</span>}
                  {readyCount  > 0 && <span className="text-amber-600 font-medium"> · {readyCount} ready</span>}
                  {createdCount> 0 && <span className="text-green-600 font-medium"> · {createdCount} created</span>}
                  {errorCount  > 0 && <span className="text-red-500  font-medium"> · {errorCount} failed</span>}
                </p>
                {(busyCount > 0 || doneCount > 0) && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${batchPct}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-10 text-right">{batchPct}%</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-0.5">Drop multiple invoice PDFs — invoices for the same matter are grouped automatically.</p>
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
                <p className="text-sm text-slate-500">Drop more invoices to add them to the queue</p>
              ) : (
                <>
                  <p className="font-medium text-slate-700">Drop invoice PDFs here</p>
                  <p className="text-sm text-slate-400 mt-1">Invoices for the same matter are grouped automatically · PDF, PNG, JPG · max 20MB</p>
                </>
              )}
            </div>
          </div>

          {/* ── Select-all bar ── */}
          {readyItems.length >= 2 && (
            <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-medium text-amber-800 hover:text-amber-900">
                {allSelected
                  ? <CheckSquare className="h-3.5 w-3.5 text-brand-500" />
                  : <Square className="h-3.5 w-3.5 text-slate-400" />}
                {allSelected ? 'Deselect All' : 'Select All'} ready matters
              </button>
              {selectedCount > 0 && (
                <span className="text-xs text-amber-700">{selectedCount} of {readyItems.length} selected</span>
              )}
            </div>
          )}

          {/* ── Queue ── */}
          {queue.length > 0 && (
            <div className="divide-y divide-slate-100">
              {queue.map(item => (
                <div key={item.id}>

                  {/* ── Row ── */}
                  <div className={`px-6 py-3 transition-colors ${
                    item.status === 'ready' && selected.has(item.id) ? 'bg-brand-50/40' : 'hover:bg-slate-50'
                  }`}>
                    <div className="flex items-center gap-3">

                      {/* Checkbox / file icon */}
                      {item.status === 'ready' ? (
                        <button onClick={() => toggleSelect(item.id)}
                          className="flex-shrink-0 text-slate-400 hover:text-brand-600 transition-colors">
                          {selected.has(item.id)
                            ? <CheckSquare className="h-4 w-4 text-brand-500" />
                            : <Square className="h-4 w-4" />}
                        </button>
                      ) : (
                        <FileText className="h-4 w-4 text-slate-300 flex-shrink-0" />
                      )}

                      {/* File info */}
                      <div className="w-36 flex-shrink-0 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{item.file.name}</p>
                        <p className="text-xs text-slate-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                      </div>

                      {/* Inline matter name (shown once parsed) */}
                      {['ready','dupe','creating','created'].includes(item.status) ? (
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            placeholder="Matter name (required)"
                            value={item.matterName}
                            onChange={e => editField(item.id, 'matterName', e.target.value)}
                            disabled={['creating','created'].includes(item.status)}
                            className={`w-full text-sm border rounded-lg px-2.5 py-1.5 outline-none transition-colors
                              ${item.status === 'created'
                                ? 'bg-green-50 border-green-200 text-green-800 cursor-default'
                                : !item.matterName.trim()
                                  ? 'border-red-300 bg-red-50 focus:border-red-400'
                                  : 'border-slate-200 bg-white focus:border-brand-400'
                              }`}
                          />
                          {!item.matterName.trim() && item.status === 'ready' && (
                            <p className="text-xs text-red-500 mt-0.5 pl-0.5">Required</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          {/* Parsed summary or status message */}
                          {item.status === 'error' && (
                            <p className="text-xs text-red-500 truncate">{item.error}</p>
                          )}
                          {['queued','uploading','parsing'].includes(item.status) && (
                            <p className="text-xs text-slate-400 italic">Processing…</p>
                          )}
                        </div>
                      )}

                      {/* Parsed quick summary */}
                      {['ready','dupe','created'].includes(item.status) && item.parsed && (
                        <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 flex-shrink-0">
                          {item.parsed.invoice_number && <span className="font-mono">#{item.parsed.invoice_number}</span>}
                          {item.parsed.total_amount   && <span className="font-semibold text-slate-600">${parseFloat(item.parsed.total_amount).toLocaleString()}</span>}
                          {item.parsed.line_items?.length > 0 && <span>{item.parsed.line_items.length} lines</span>}
                          {item.parsed._parseFailed   && <span className="text-amber-600">Manual entry needed</span>}
                        </div>
                      )}

                      {/* Step pipeline */}
                      <StepPipeline status={item.status} />

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {item.status === 'dupe' && (
                          <button onClick={() => createItem(item, true)}
                            className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition-colors">
                            <AlertTriangle className="h-3.5 w-3.5" /> Create Anyway
                          </button>
                        )}
                        {item.status === 'ready' && (
                          <>
                            <button onClick={() => toggleExpand(item.id)}
                              className="p-1 text-slate-400 hover:text-slate-600"
                              title={item.expanded ? 'Collapse' : 'Edit details'}>
                              {item.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button onClick={() => createItem(item)}
                              disabled={!item.matterName.trim()}
                              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                              <FolderOpen className="h-3.5 w-3.5" /> Create
                            </button>
                          </>
                        )}
                        {item.status === 'created' && item.matterId && (
                          <button
                            onClick={() => { onClose(); navigate(`/matters/${item.matterId}?promptParties=1`) }}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors">
                            Open →
                          </button>
                        )}
                        {item.status === 'error' && (
                          <button onClick={() => retryItem(item)} className="p-1 text-slate-400 hover:text-brand-600" title="Retry">
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        )}
                        {!['uploading','parsing','creating'].includes(item.status) && (
                          <button onClick={() => removeItem(item.id)} className="p-1 text-slate-300 hover:text-red-500" title="Remove">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline dupe warning */}
                    {item.status === 'dupe' && item.dupeWarnings?.length > 0 && (
                      <div className="mt-2 ml-7 space-y-1">
                        {item.dupeWarnings.map((w, i) => (
                          <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                            {w.type === 'matter_number' && <>Matter #{w.match.matter_number} already exists: "{w.match.name}"</>}
                            {w.type === 'matter_name'   && <>Matter named "{w.match.name}" already exists</>}
                            {w.type === 'invoice'       && <>Invoice #{w.match.invoice_number} from {w.match.billing_firm} already exists{w.match.la_matters?.name ? ` on "${w.match.la_matters.name}"` : ''}</>}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Expanded detail editor ── */}
                  {item.expanded && item.status === 'ready' && item.parsed && (
                    <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                      {item.parsed._parseFailed && (
                        <div className="py-2.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 mt-3">
                          ⚠ AI couldn't fully parse this file — please fill in the fields below.
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 pt-4">

                        {/* Matter fields */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <FolderOpen className="h-3.5 w-3.5 text-brand-400" /> Matter
                          </p>
                          <div>
                            <label className="form-label text-xs">Matter Name *</label>
                            <input type="text" className="form-input text-sm py-1.5"
                              value={item.matterName}
                              onChange={e => editField(item.id, 'matterName', e.target.value)}
                              placeholder="Smith v. Acme Corp — Liability" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Matter Number</label>
                            <input type="text" className="form-input text-sm py-1.5"
                              value={item.matterNumber}
                              onChange={e => editField(item.id, 'matterNumber', e.target.value)}
                              placeholder="2025-MDN-0047" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Firm Name</label>
                            <input type="text" className="form-input text-sm py-1.5"
                              value={item.firmName}
                              onChange={e => editField(item.id, 'firmName', e.target.value)}
                              placeholder="ABC Legal, LLP" />
                          </div>
                          <div>
                            <label className="form-label text-xs">Description</label>
                            <textarea className="form-input text-sm py-1.5 h-16 resize-none"
                              value={item.description}
                              onChange={e => editField(item.id, 'description', e.target.value)}
                              placeholder="Brief description…" />
                          </div>
                        </div>

                        {/* Invoice fields */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-slate-400" /> Invoice
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Invoice #',     field: 'invoice_number', type: 'text'   },
                              { label: 'Invoice Date',  field: 'invoice_date',   type: 'date'   },
                              { label: 'Billing Firm',  field: 'billing_firm',   type: 'text'   },
                              { label: 'Total Amount',  field: 'total_amount',   type: 'number' },
                              { label: 'Service Start', field: 'service_start',  type: 'date'   },
                              { label: 'Service End',   field: 'service_end',    type: 'date'   },
                            ].map(({ label, field, type }) => (
                              <div key={field}>
                                <label className="form-label text-xs">{label}</label>
                                <input type={type} step={type === 'number' ? '0.01' : undefined}
                                  className="form-input text-sm py-1.5"
                                  value={item.parsed[field] || ''}
                                  onChange={e => editParsed(item.id, field, e.target.value)} />
                              </div>
                            ))}
                          </div>

                          {/* Line items */}
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                Line Items
                                {item.parsed.line_items?.length > 0 && (
                                  <span className="ml-1.5 font-normal text-slate-400 normal-case">
                                    {item.parsed.line_items.length} rows
                                  </span>
                                )}
                              </p>
                              <div className="flex items-center gap-2">
                                {item.parsed.line_items?.length > 0 && (
                                  <button type="button" onClick={() => syncTotal(item.id)}
                                    className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1">
                                    <RefreshCcw className="h-3 w-3" /> Sync
                                  </button>
                                )}
                                <button type="button" onClick={() => addLineItem(item.id)}
                                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg">
                                  <Plus className="h-3 w-3" /> Add Row
                                </button>
                              </div>
                            </div>
                            {(!item.parsed.line_items || item.parsed.line_items.length === 0) ? (
                              <div className="text-center py-3 border border-dashed border-slate-200 rounded-lg">
                                <p className="text-xs text-slate-400">No line items</p>
                              </div>
                            ) : (
                              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0">
                                    <tr className="bg-slate-100 border-b border-slate-200">
                                      <th className="text-left font-semibold text-slate-500 px-2 py-1.5">Description</th>
                                      <th className="text-right font-semibold text-slate-500 px-2 py-1.5 w-20">Amount</th>
                                      <th className="w-6" />
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {item.parsed.line_items.map((li, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50 group">
                                        <td className="px-1 py-1">
                                          <input type="text"
                                            className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                            value={li.description || ''}
                                            onChange={e => editLineItem(item.id, idx, 'description', e.target.value)}
                                            placeholder="Description" />
                                        </td>
                                        <td className="px-1 py-1">
                                          <input type="number" step="0.01"
                                            className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none text-right font-semibold"
                                            value={li.amount || ''}
                                            onChange={e => editLineItem(item.id, idx, 'amount', e.target.value)}
                                            placeholder="0.00" />
                                        </td>
                                        <td className="px-1 py-1 text-center">
                                          <button type="button" onClick={() => deleteLineItem(item.id, idx)}
                                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-0.5 rounded">
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
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

          <div className="flex items-center gap-3">
            {/* Navigate to created matters when all done */}
            {allDone && createdIds.length > 0 && createdIds.length === 1 && (
              <button
                onClick={() => { onClose(); navigate(`/matters/${createdIds[0]}?promptParties=1`) }}
                className="btn-secondary text-brand-600 border-brand-200 hover:bg-brand-50"
              >
                Open Matter →
              </button>
            )}
            {allDone && createdCount > 0 && (
              <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" /> {createdCount} matter{createdCount !== 1 ? 's' : ''} created
              </span>
            )}

            {/* Batch create button */}
            {selectedCount > 0 && (
              <button onClick={createSelected} disabled={processing} className="btn-primary">
                <FolderOpen className="h-4 w-4" />
                Create {selectedCount} Matter{selectedCount !== 1 ? 's' : ''}
              </button>
            )}
            {selectedCount === 0 && readyCount === 1 && (
              <button
                onClick={() => createItem(queue.find(i => i.status === 'ready'))}
                disabled={!queue.find(i => i.status === 'ready')?.matterName?.trim()}
                className="btn-primary disabled:opacity-40"
              >
                <FolderOpen className="h-4 w-4" /> Create Matter
              </button>
            )}

            {queue.length === 0 && (
              <p className="text-sm text-slate-400">Drop invoice PDFs above to get started</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
