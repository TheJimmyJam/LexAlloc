import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  X, Upload, Loader2, CheckCircle, AlertCircle, FileText,
  Trash2, ChevronDown, ChevronUp, Save, RefreshCw, Plus, RefreshCcw
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'
import toast from 'react-hot-toast'

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

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    queued:    { label: 'Queued',    cls: 'bg-slate-100 text-slate-500' },
    uploading: { label: 'Uploading', cls: 'bg-blue-100 text-blue-600',  spin: true },
    parsing:   { label: 'Parsing',   cls: 'bg-violet-100 text-violet-600', spin: true },
    ready:     { label: 'Ready',     cls: 'bg-amber-100 text-amber-700' },
    saving:    { label: 'Saving',    cls: 'bg-blue-100 text-blue-600',  spin: true },
    saved:     { label: 'Saved ✓',   cls: 'bg-green-100 text-green-700' },
    error:     { label: 'Error',     cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls, spin } = map[status] || map.queued
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {spin && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </span>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function InvoiceUploadModal({ matterId, onClose }) {
  const { profile } = useAuth()
  const [queue, setQueue]         = useState([])   // [{ id, file, status, error, fileUrl, parsed, expanded }]
  const [processing, setProcessing] = useState(false)
  const nextId = useRef(0)

  const update = (id, patch) =>
    setQueue(q => q.map(item => item.id === id ? { ...item, ...patch } : item))

  // ── Process a single file: upload → AI parse ──────────────────────────────
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

    update(id, { status: 'ready', fileUrl: publicUrl, parsed: { ...parsed, _fileUrl: publicUrl }, expanded: false })
  }

  // ── Drop handler ──────────────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return
    const newItems = acceptedFiles.map(file => ({
      id:       nextId.current++,
      file,
      status:   'queued',
      error:    null,
      fileUrl:  null,
      parsed:   null,
      expanded: false,
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

  // ── Save a single item ────────────────────────────────────────────────────
  const saveItem = async (item) => {
    const { id, parsed, fileUrl } = item
    update(id, { status: 'saving' })
    try {
      const { data: invoice, error: invErr } = await supabase.from('la_invoices').insert({
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

      update(id, { status: 'saved', expanded: false })
      api.sendEvent('invoice_parsed', profile.org_id, matterId, {
        invoice_number: parsed.invoice_number,
        billing_firm:   parsed.billing_firm,
      }).catch(() => {})
    } catch (err) {
      update(id, { status: 'error', error: err.message })
    }
  }

  // ── Save all ready items ──────────────────────────────────────────────────
  const saveAll = async () => {
    const ready = queue.filter(i => i.status === 'ready')
    await Promise.all(ready.map(saveItem))
    const saved = queue.filter(i => i.status === 'saved').length + ready.length
    toast.success(`${ready.length} invoice${ready.length !== 1 ? 's' : ''} saved!`)
  }

  const removeItem = (id) => setQueue(q => q.filter(i => i.id !== id))
  const retryItem  = (item) => { update(item.id, { status: 'queued', error: null }); processFile(item) }
  const toggleExpand = (id) => update(id, { expanded: !queue.find(i => i.id === id)?.expanded })
  const editParsed = (id, field, value) =>
    setQueue(q => q.map(i => i.id === id ? { ...i, parsed: { ...i.parsed, [field]: value } } : i))

  // ── Line item helpers ─────────────────────────────────────────────────────
  const editLineItem = (id, idx, field, value) =>
    setQueue(q => q.map(i => {
      if (i.id !== id) return i
      const items = [...(i.parsed?.line_items || [])]
      items[idx] = { ...items[idx], [field]: value }
      // Auto-recalc total from sum of amounts
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

  const readyCount  = queue.filter(i => i.status === 'ready').length
  const savedCount  = queue.filter(i => i.status === 'saved').length
  const errorCount  = queue.filter(i => i.status === 'error').length
  const busyCount   = queue.filter(i => ['uploading','parsing','saving'].includes(i.status)).length
  const allDone     = queue.length > 0 && queue.every(i => ['saved','error'].includes(i.status))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">Upload Invoices</h2>
            {queue.length > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {queue.length} file{queue.length !== 1 ? 's' : ''}
                {busyCount  > 0 && ` · ${busyCount} processing`}
                {readyCount > 0 && ` · ${readyCount} ready to save`}
                {savedCount > 0 && ` · ${savedCount} saved`}
                {errorCount > 0 && ` · ${errorCount} failed`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Drop zone */}
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
                  <p className="text-sm text-slate-400 mt-1">Multiple files supported · PDF, PNG, JPG · max 20MB each</p>
                </>
              )}
            </div>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="divide-y divide-slate-100">
              {queue.map(item => (
                <div key={item.id}>
                  {/* Row summary */}
                  <div className="flex items-center gap-3 px-6 py-3 hover:bg-slate-50">
                    <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.file.name}</p>
                      <p className="text-xs text-slate-400">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>

                    {/* Parsed summary (when ready/saved) */}
                    {(item.status === 'ready' || item.status === 'saved') && item.parsed && (
                      <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500">
                        {item.parsed.invoice_number && <span className="font-mono">#{item.parsed.invoice_number}</span>}
                        {item.parsed.total_amount   && <span className="font-semibold text-slate-700">${parseFloat(item.parsed.total_amount).toLocaleString()}</span>}
                        {item.parsed.line_items?.length > 0 && <span>{item.parsed.line_items.length} lines</span>}
                        {item.parsed._parseFailed && <span className="text-amber-600">Manual entry needed</span>}
                      </div>
                    )}

                    {item.status === 'error' && (
                      <p className="text-xs text-red-500 max-w-xs truncate">{item.error}</p>
                    )}

                    <StatusBadge status={item.status} />

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
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
                            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg transition-colors"
                          >
                            <Save className="h-3.5 w-3.5" /> Save
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

                  {/* Expanded edit form */}
                  {item.expanded && item.status === 'ready' && item.parsed && (
                    <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                      {item.parsed._parseFailed && (
                        <div className="py-3 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 my-3">
                          ⚠ AI couldn't parse this file automatically — please fill in the fields below.
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
                            <input
                              type={type}
                              step={type === 'number' ? '0.01' : undefined}
                              className="form-input text-sm py-1.5"
                              value={item.parsed[field] || ''}
                              onChange={e => editParsed(item.id, field, e.target.value)}
                            />
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
                                      <input
                                        type="date"
                                        className="w-full border border-transparent hover:border-slate-200 focus:border-brand-400 rounded px-1 py-0.5 text-xs bg-transparent focus:bg-white outline-none"
                                        value={li.date_of_service || li.date || ''}
                                        onChange={e => editLineItem(item.id, idx, 'date_of_service', e.target.value)}
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

        {/* Footer */}
        <div className="border-t border-slate-200 p-4 flex-shrink-0 flex items-center justify-between gap-3">
          <button onClick={onClose} className="btn-secondary">
            {allDone ? 'Done' : 'Cancel'}
          </button>

          {queue.length > 0 && (
            <div className="flex items-center gap-3">
              {readyCount > 1 && (
                <button
                  onClick={saveAll}
                  disabled={processing}
                  className="btn-primary"
                >
                  <Save className="h-4 w-4" />
                  Save All ({readyCount})
                </button>
              )}
              {readyCount === 1 && (
                <button
                  onClick={() => saveItem(queue.find(i => i.status === 'ready'))}
                  className="btn-primary"
                >
                  <Save className="h-4 w-4" /> Save Invoice
                </button>
              )}
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
