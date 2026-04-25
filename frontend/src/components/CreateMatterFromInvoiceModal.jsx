import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Upload, Loader2, FileText, ArrowRight, ArrowLeft,
  CheckCircle, AlertCircle, AlertTriangle, FolderOpen, Plus, Trash2,
  RefreshCcw, Save,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'
import { logAudit } from '../lib/audit.js'
import toast from 'react-hot-toast'

// ── Step indicator ────────────────────────────────────────────────────────────
function Steps({ current }) {
  const steps = ['Upload Invoice', 'Matter Details', 'Done']
  return (
    <div className="flex items-center gap-2 mb-0">
      {steps.map((label, i) => {
        const idx  = i + 1
        const done = idx < current
        const active = idx === current
        return (
          <div key={label} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${
              active ? 'text-brand-600' : done ? 'text-green-600' : 'text-slate-400'
            }`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                done   ? 'bg-green-100 text-green-600'   :
                active ? 'bg-brand-100 text-brand-600'   :
                         'bg-slate-100 text-slate-400'
              }`}>
                {done ? <CheckCircle className="h-3 w-3" /> : idx}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < steps.length - 1 && <div className="w-6 h-px bg-slate-200 flex-shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    idle:      { label: 'Waiting',   cls: 'bg-slate-100 text-slate-500' },
    uploading: { label: 'Uploading', cls: 'bg-blue-100 text-blue-600',     spin: true },
    parsing:   { label: 'Parsing',   cls: 'bg-violet-100 text-violet-600', spin: true },
    ready:     { label: 'Parsed',    cls: 'bg-amber-100 text-amber-700' },
    error:     { label: 'Error',     cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls, spin } = map[status] || map.idle
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {spin && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function CreateMatterFromInvoiceModal({ onClose }) {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const qc          = useQueryClient()

  // Step 1 state
  const [step, setStep]         = useState(1)
  const [file, setFile]         = useState(null)
  const [fileUrl, setFileUrl]   = useState(null)
  const [parsed, setParsed]     = useState(null)
  const [parseStatus, setParseStatus] = useState('idle')   // idle | uploading | parsing | ready | error
  const [parseError, setParseError]   = useState(null)

  // Step 2 state — matter fields
  const [firmName,     setFirmName]     = useState('')
  const [matterNumber, setMatterNumber] = useState('')
  const [matterName,   setMatterName]   = useState('')
  const [description,  setDescription]  = useState('')

  // Editable invoice fields (Step 2 right column)
  const [inv, setInv] = useState(null)   // mirrors `parsed` but user-editable
  const setInvField = (field, val) => setInv(p => ({ ...p, [field]: val }))

  const [saving, setSaving] = useState(false)
  const [dupeWarning, setDupeWarning] = useState(null)  // { type, matches } | null

  // ── File processing ───────────────────────────────────────────────────────
  const processFile = async (f) => {
    setFile(f)
    setParseError(null)
    setParseStatus('uploading')

    try {
      // Upload to storage
      const path = `${profile.org_id}/invoices/${Date.now()}-${f.name}`
      const { error: uploadErr } = await supabase.storage
        .from('la_invoices')
        .upload(path, f, { contentType: f.type })
      if (uploadErr) throw uploadErr

      const { data: signedData, error: signedErr } = await supabase.storage
        .from('la_invoices')
        .createSignedUrl(path, 300)
      if (signedErr) throw signedErr

      const { data: { publicUrl } } = supabase.storage.from('la_invoices').getPublicUrl(path)
      setFileUrl(publicUrl)

      // AI parse
      setParseStatus('parsing')
      let result
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', {
          body: { fileUrl: signedData.signedUrl, fileType: f.type },
        })
        if (fnErr) throw fnErr
        if (data?.error) throw new Error(data.error)
        result = { ...data, _fileUrl: publicUrl }
      } catch {
        result = {
          invoice_number: '', invoice_date: new Date().toISOString().split('T')[0],
          billing_firm: '', total_amount: 0,
          service_start: new Date().toISOString().split('T')[0],
          service_end:   new Date().toISOString().split('T')[0],
          line_items: [], _parseFailed: true, _fileUrl: publicUrl,
        }
      }

      setParsed(result)
      setInv(result)

      // Pre-seed matter fields from parsed invoice data
      if (result.billing_firm && !firmName) {
        setFirmName(result.billing_firm)
      }
      if (result.matter_number && !matterNumber) {
        setMatterNumber(result.matter_number)
      }
      if (result.matter_name && !matterName) {
        setMatterName(result.matter_name)
      }

      setParseStatus('ready')
    } catch (err) {
      setParseStatus('error')
      setParseError(err.message || 'Upload failed')
    }
  }

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length) processFile(acceptedFiles[0])
  }, [profile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept:   { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxSize:  20 * 1024 * 1024,
    multiple: false,
  })

  // ── Line item helpers ─────────────────────────────────────────────────────
  const editLineItem = (idx, field, val) => {
    setInv(p => {
      const items = [...(p.line_items || [])]
      items[idx] = { ...items[idx], [field]: val }
      const total = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
      return { ...p, line_items: items, total_amount: parseFloat(total.toFixed(2)) }
    })
  }
  const addLineItem = () => setInv(p => ({
    ...p,
    line_items: [...(p.line_items || []), {
      date_of_service: '', description: '', timekeeper: '',
      hours: '', rate: '', amount: '', category: 'fees',
    }],
  }))
  const deleteLineItem = (idx) => setInv(p => {
    const items = (p.line_items || []).filter((_, j) => j !== idx)
    const total = items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
    return { ...p, line_items: items, total_amount: parseFloat(total.toFixed(2)) }
  })
  const syncTotal = () => setInv(p => {
    const total = (p.line_items || []).reduce((s, li) => s + (parseFloat(li.amount) || 0), 0)
    return { ...p, total_amount: parseFloat(total.toFixed(2)) }
  })

  // ── Create matter + invoice ───────────────────────────────────────────────
  const handleCreate = async (force = false) => {
    if (!matterName.trim()) { toast.error('Matter name is required'); return }

    if (!force) {
      // ── Dupe checks ──────────────────────────────────────────────────────
      const warnings = []

      // 1. Duplicate matter (same matter_number or exact name in this org)
      if (matterNumber.trim()) {
        const { data: dupeMatter } = await supabase
          .from('la_matters')
          .select('id, name, matter_number')
          .eq('org_id', profile.org_id)
          .eq('matter_number', matterNumber.trim())
          .limit(1)
        if (dupeMatter?.length) warnings.push({ type: 'matter_number', match: dupeMatter[0] })
      }
      if (!warnings.length && matterName.trim()) {
        const { data: dupeName } = await supabase
          .from('la_matters')
          .select('id, name, matter_number')
          .eq('org_id', profile.org_id)
          .ilike('name', matterName.trim())
          .limit(1)
        if (dupeName?.length) warnings.push({ type: 'matter_name', match: dupeName[0] })
      }

      // 2. Duplicate invoice (same invoice_number + billing_firm in this org)
      if (inv?.invoice_number && inv?.billing_firm) {
        const { data: dupeInv } = await supabase
          .from('la_invoices')
          .select('id, invoice_number, billing_firm, la_matters(name)')
          .eq('org_id', profile.org_id)
          .eq('invoice_number', inv.invoice_number)
          .eq('billing_firm', inv.billing_firm)
          .limit(1)
        if (dupeInv?.length) warnings.push({ type: 'invoice', match: dupeInv[0] })
      }

      if (warnings.length) { setDupeWarning(warnings); return }
    }

    setDupeWarning(null)
    setSaving(true)
    try {
      // 1. Create matter
      const { data: newMatter, error: mErr } = await supabase
        .from('la_matters')
        .insert({
          org_id:        profile.org_id,
          name:          matterName.trim(),
          matter_number: matterNumber.trim() || null,
          firm_name:     firmName.trim()     || null,
          description:   description.trim()  || null,
          status:        'active',
          created_by:    profile.id,
          is_template:   false,
        })
        .select()
        .single()
      if (mErr) throw mErr

      logAudit({
        profile,
        matterId: newMatter.id,
        action: 'matter.created',
        entityType: 'matter',
        entityId: newMatter.id,
        entityName: matterName.trim(),
        metadata: { matter_number: matterNumber.trim() || null, created_from_invoice: true },
      })

      // 2. Save invoice
      const { data: invoice, error: invErr } = await supabase
        .from('la_invoices')
        .insert({
          matter_id:      newMatter.id,
          org_id:         profile.org_id,
          file_url:       fileUrl,
          invoice_number: inv.invoice_number,
          invoice_date:   inv.invoice_date,
          billing_firm:   inv.billing_firm,
          total_amount:   parseFloat(inv.total_amount) || 0,
          service_start:  inv.service_start,
          service_end:    inv.service_end,
          status:         'parsed',
          parsed_data:    inv,
        })
        .select()
        .single()
      if (invErr) throw invErr

      // 3. Save line items
      if (inv.line_items?.length > 0) {
        const lineItems = inv.line_items.map(li => ({
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

      api.sendEvent('invoice_parsed', profile.org_id, newMatter.id, {
        invoice_number: inv.invoice_number,
        billing_firm:   inv.billing_firm,
      }).catch(() => {})

      qc.invalidateQueries({ queryKey: ['matters'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })

      toast.success('Matter created with invoice!')
      onClose()
      navigate(`/matters/${newMatter.id}?promptParties=1`)
    } catch (err) {
      toast.error(err.message || 'Failed to create matter')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div className="space-y-2">
            <h2 className="font-semibold text-lg text-slate-900">Create Matter from Invoice</h2>
            <Steps current={step} />
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors p-10 ${
                isDragActive
                  ? 'border-brand-500 bg-brand-50'
                  : parseStatus === 'ready'
                    ? 'border-green-300 bg-green-50'
                    : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
              }`}
            >
              <input {...getInputProps()} />
              {parseStatus === 'idle' && (
                <>
                  <Upload className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                  <p className="font-medium text-slate-700">Drop an invoice PDF here</p>
                  <p className="text-sm text-slate-400 mt-1">PDF, PNG, JPG · max 20 MB · single file</p>
                </>
              )}
              {(parseStatus === 'uploading' || parseStatus === 'parsing') && (
                <>
                  <Loader2 className="h-10 w-10 text-brand-400 mx-auto mb-4 animate-spin" />
                  <p className="font-medium text-slate-700">
                    {parseStatus === 'uploading' ? 'Uploading…' : 'Parsing with AI…'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">This usually takes a few seconds</p>
                </>
              )}
              {parseStatus === 'ready' && (
                <>
                  <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-4" />
                  <p className="font-medium text-slate-700">{file?.name}</p>
                  <p className="text-sm text-slate-400 mt-1">Parsed — click Continue to review details</p>
                </>
              )}
              {parseStatus === 'error' && (
                <>
                  <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-4" />
                  <p className="font-medium text-red-600">Upload failed</p>
                  <p className="text-sm text-slate-400 mt-1">{parseError} · Drop another file to try again</p>
                </>
              )}
            </div>

            {/* Quick parsed preview */}
            {parseStatus === 'ready' && parsed && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-slate-50 text-sm">
                {[
                  ['Invoice #',     parsed.invoice_number || '—'],
                  ['Date',          parsed.invoice_date   || '—'],
                  ['Billing Firm',  parsed.billing_firm   || '—'],
                  ['Total',         parsed.total_amount ? `$${parseFloat(parsed.total_amount).toLocaleString()}` : '—'],
                  ['Service Period',parsed.service_start && parsed.service_end ? `${parsed.service_start} → ${parsed.service_end}` : '—'],
                  ['Line Items',    `${parsed.line_items?.length ?? 0} rows`],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center gap-4 px-4 py-2.5">
                    <span className="text-slate-400 w-32 flex-shrink-0">{label}</span>
                    <span className="font-medium text-slate-800">{val}</span>
                  </div>
                ))}
                {parsed._parseFailed && (
                  <div className="px-4 py-2.5 text-amber-700 bg-amber-50 rounded-b-xl text-xs">
                    ⚠ AI couldn't fully parse this file — you can fill in the details in the next step.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Matter + Invoice Details ── */}
        {step === 2 && inv && (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">

              {/* Left: Matter fields */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <FolderOpen className="h-4 w-4 text-brand-500" />
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">New Matter</h3>
                </div>

                <div>
                  <label className="form-label">Firm Name</label>
                  <input
                    className="form-input"
                    placeholder="ABC Legal, LLP"
                    value={firmName}
                    onChange={e => setFirmName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Matter Number</label>
                  <input
                    className="form-input"
                    placeholder="2025-MDN-0047"
                    value={matterNumber}
                    onChange={e => setMatterNumber(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Matter Name *</label>
                  <input
                    className="form-input"
                    placeholder="Holloway v. Meridian Industries — Employment Dispute"
                    value={matterName}
                    onChange={e => setMatterName(e.target.value)}
                  />
                  {!matterName.trim() && (
                    <p className="text-xs text-slate-400 mt-1">Required</p>
                  )}
                </div>

                <div>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input h-20 resize-none"
                    placeholder="Brief description of the matter…"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>

                <div className="rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5 text-xs text-brand-700">
                  The invoice will be automatically attached. You can add parties and insurer assignments after creation.
                </div>
              </div>

              {/* Right: Invoice fields */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-800 text-sm uppercase tracking-wide">Invoice Details</h3>
                </div>

                {inv._parseFailed && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    ⚠ AI parse incomplete — please fill in the fields below.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
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
                      <input
                        type={type}
                        step={type === 'number' ? '0.01' : undefined}
                        className="form-input text-sm py-1.5"
                        value={inv[field] || ''}
                        onChange={e => setInvField(field, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                {/* Line items (collapsible) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      Line Items
                      {inv.line_items?.length > 0 && (
                        <span className="ml-2 font-normal text-slate-400 normal-case">
                          {inv.line_items.length} row{inv.line_items.length !== 1 ? 's' : ''}
                          {' · '}
                          ${inv.line_items.reduce((s, li) => s + (parseFloat(li.amount) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2">
                      {inv.line_items?.length > 0 && (
                        <button type="button" onClick={syncTotal}
                          className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1">
                          <RefreshCcw className="h-3 w-3" /> Sync total
                        </button>
                      )}
                      <button type="button" onClick={addLineItem}
                        className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 font-medium bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg transition-colors">
                        <Plus className="h-3 w-3" /> Add Row
                      </button>
                    </div>
                  </div>

                  {(!inv.line_items || inv.line_items.length === 0) ? (
                    <div className="text-center py-3 border border-dashed border-slate-200 rounded-lg">
                      <p className="text-xs text-slate-400">No line items — click Add Row to enter manually.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-52 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="text-left font-semibold text-slate-500 px-2 py-1.5 w-24">Date</th>
                            <th className="text-left font-semibold text-slate-500 px-2 py-1.5">Description</th>
                            <th className="text-right font-semibold text-slate-500 px-2 py-1.5 w-20">Amount</th>
                            <th className="w-6" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {inv.line_items.map((li, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 group">
                              <td className="px-1 py-1">
                                <input type="date"
                                  className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                  value={li.date_of_service || li.date || ''}
                                  onChange={e => editLineItem(idx, 'date_of_service', e.target.value)}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input type="text"
                                  className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                  value={li.description || ''}
                                  onChange={e => editLineItem(idx, 'description', e.target.value)}
                                  placeholder="Description"
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input type="number" step="0.01"
                                  className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none text-right font-semibold"
                                  value={li.amount || ''}
                                  onChange={e => editLineItem(idx, 'amount', e.target.value)}
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button type="button" onClick={() => deleteLineItem(idx)}
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

        {/* Dupe warning modal */}
        {dupeWarning && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Possible Duplicate Detected</h3>
                  <p className="text-sm text-slate-500 mt-0.5">We found existing records that may match. Review before continuing.</p>
                </div>
              </div>
              <div className="space-y-2">
                {dupeWarning.map((w, i) => (
                  <div key={i} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm">
                    {w.type === 'matter_number' && <><span className="font-medium text-amber-800">Matter #{w.match.matter_number}</span><span className="text-amber-700"> already exists: "{w.match.name}"</span></>}
                    {w.type === 'matter_name'   && <><span className="font-medium text-amber-800">Matter name</span><span className="text-amber-700"> "{w.match.name}" already exists</span></>}
                    {w.type === 'invoice'       && <><span className="font-medium text-amber-800">Invoice #{w.match.invoice_number}</span><span className="text-amber-700"> from {w.match.billing_firm} already exists{w.match.la_matters?.name ? ` on matter "${w.match.la_matters.name}"` : ''}</span></>}
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setDupeWarning(null)} className="btn-secondary flex-1 justify-center">Go Back</button>
                <button onClick={() => handleCreate(true)} className="btn-primary flex-1 justify-center bg-amber-600 hover:bg-amber-700 border-amber-600">Create Anyway</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex-shrink-0 flex items-center justify-between gap-3">
          {step === 1 ? (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button
                onClick={() => setStep(2)}
                disabled={parseStatus !== 'ready'}
                className="btn-primary"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep(1)} className="btn-secondary">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !matterName.trim()}
                className="btn-primary"
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                  : <><FolderOpen className="h-4 w-4" /> Create Matter &amp; Save Invoice</>
                }
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
