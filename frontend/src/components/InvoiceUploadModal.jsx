import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, Loader2, CheckCircle, AlertCircle, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import { api } from '../lib/api.js'
import toast from 'react-hot-toast'

export default function InvoiceUploadModal({ matterId, onClose }) {
  const { profile } = useAuth()
  const [stage, setStage]     = useState('upload')   // upload | uploading | parsing | review | saving
  const [file, setFile]       = useState(null)
  const [parsed, setParsed]   = useState(null)
  const [error, setError]     = useState(null)

  const onDrop = useCallback((acceptedFiles) => {
    setFile(acceptedFiles[0])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
  })

  const handleUploadAndParse = async () => {
    if (!file) return
    setStage('uploading')
    setError(null)

    try {
      // 1. Upload to Supabase Storage
      const path = `${profile.org_id}/invoices/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage
        .from('la_invoices')
        .upload(path, file, { contentType: file.type })
      if (uploadErr) throw uploadErr

      // Create a signed URL valid for 5 minutes for the edge function to fetch
      const { data: signedData, error: signedErr } = await supabase.storage
        .from('la_invoices')
        .createSignedUrl(path, 300)
      if (signedErr) throw signedErr

      const fileUrl = signedData.signedUrl

      setStage('parsing')

      // 2. Call Supabase Edge Function for AI parsing
      let parsedData
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('parse-invoice', {
          body: { fileUrl, fileType: file.type },
        })
        if (fnErr) throw fnErr
        if (data.error) throw new Error(data.error)
        parsedData = data
      } catch (e) {
        // Fallback: manual entry mode
        console.warn('AI parsing failed, falling back to manual entry:', e.message)
        parsedData = {
          invoice_number:  '',
          invoice_date:    new Date().toISOString().split('T')[0],
          billing_firm:    '',
          total_amount:    0,
          service_start:   new Date().toISOString().split('T')[0],
          service_end:     new Date().toISOString().split('T')[0],
          line_items:      [],
          _parseFailed:    true,
        }
      }

      // Store permanent public path for the saved invoice record
      const { data: { publicUrl } } = supabase.storage.from('la_invoices').getPublicUrl(path)
      setParsed({ ...parsedData, _fileUrl: publicUrl })
      setStage('review')
    } catch (err) {
      setError(err.message || 'Upload failed')
      setStage('upload')
    }
  }

  const handleSave = async () => {
    setStage('saving')
    try {
      // 3. Save invoice + line items to DB
      const { data: invoice, error: invErr } = await supabase.from('la_invoices').insert({
        matter_id:      matterId,
        org_id:         profile.org_id,
        file_url:       parsed._fileUrl,
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

      // 4. Save line items
      if (parsed.line_items?.length > 0) {
        const lineItems = parsed.line_items.map(li => ({
          invoice_id:       invoice.id,
          date_of_service:  li.date || li.date_of_service,
          description:      li.description,
          timekeeper:       li.timekeeper,
          hours:            parseFloat(li.hours) || null,
          rate:             parseFloat(li.rate) || null,
          amount:           parseFloat(li.amount) || 0,
          category:         li.category || 'fees',
        }))
        await supabase.from('la_invoice_line_items').insert(lineItems)
      }

      toast.success('Invoice saved successfully!')

      // Fire-and-forget notification
      api.sendEvent('invoice_parsed', profile.org_id, matterId, {
        invoice_number: parsed.invoice_number,
        billing_firm:   parsed.billing_firm,
      }).catch(() => {})

      onClose()
    } catch (err) {
      setError(err.message)
      setStage('review')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0">
          <h2 className="font-semibold text-lg text-slate-900">
            {stage === 'upload'   && 'Upload Invoice'}
            {stage === 'uploading' && 'Uploading…'}
            {stage === 'parsing'  && 'Parsing Invoice with AI…'}
            {stage === 'review'   && 'Review Extracted Data'}
            {stage === 'saving'   && 'Saving…'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Upload Stage */}
          {(stage === 'upload') && (
            <div>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 text-slate-300 mx-auto mb-4" />
                {file ? (
                  <div>
                    <FileText className="h-6 w-6 text-brand-600 mx-auto mb-2" />
                    <p className="font-medium text-slate-800">{file.name}</p>
                    <p className="text-sm text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-slate-700">Drop your invoice PDF here</p>
                    <p className="text-sm text-slate-400 mt-1">or click to browse · PDF, PNG, JPG · max 20MB</p>
                  </div>
                )}
              </div>
              {error && <p className="text-red-500 text-sm mt-3 flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
              <div className="flex gap-3 mt-6">
                <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button onClick={handleUploadAndParse} className="btn-primary flex-1 justify-center" disabled={!file}>
                  <Upload className="h-4 w-4" /> Upload & Parse
                </button>
              </div>
            </div>
          )}

          {/* Loading Stage */}
          {(stage === 'uploading' || stage === 'parsing' || stage === 'saving') && (
            <div className="text-center py-12">
              <Loader2 className="h-10 w-10 text-brand-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-medium">
                {stage === 'uploading' && 'Uploading invoice to secure storage…'}
                {stage === 'parsing'   && 'AI is reading your invoice and extracting line items…'}
                {stage === 'saving'    && 'Saving invoice data…'}
              </p>
              <p className="text-slate-400 text-sm mt-1">This may take a moment.</p>
            </div>
          )}

          {/* Review Stage */}
          {stage === 'review' && parsed && (
            <div className="space-y-5">
              {parsed._parseFailed ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-700 text-sm">
                  ⚠ AI parsing couldn't read this file — please fill in the details manually below.
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 text-sm">
                  ✓ AI extracted the invoice data. Review and correct anything below before saving.
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Invoice Number</label>
                  <input className="form-input" value={parsed.invoice_number || ''}
                    onChange={e => setParsed(p => ({ ...p, invoice_number: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Invoice Date</label>
                  <input type="date" className="form-input" value={parsed.invoice_date || ''}
                    onChange={e => setParsed(p => ({ ...p, invoice_date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Billing Firm</label>
                  <input className="form-input" value={parsed.billing_firm || ''}
                    onChange={e => setParsed(p => ({ ...p, billing_firm: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Total Amount ($)</label>
                  <input type="number" step="0.01" className="form-input" value={parsed.total_amount || ''}
                    onChange={e => setParsed(p => ({ ...p, total_amount: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Service Period Start</label>
                  <input type="date" className="form-input" value={parsed.service_start || ''}
                    onChange={e => setParsed(p => ({ ...p, service_start: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Service Period End</label>
                  <input type="date" className="form-input" value={parsed.service_end || ''}
                    onChange={e => setParsed(p => ({ ...p, service_end: e.target.value }))} />
                </div>
              </div>

              {/* Line Items Preview */}
              {parsed.line_items?.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2">
                    Extracted Line Items ({parsed.line_items.length})
                  </h3>
                  <div className="card overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Date</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase">Description</th>
                          <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsed.line_items.map((li, i) => (
                          <tr key={i}>
                            <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{li.date || li.date_of_service || '—'}</td>
                            <td className="px-4 py-2 text-slate-700 max-w-xs">
                              <p className="truncate">{li.description}</p>
                              {li.timekeeper && <p className="text-xs text-slate-400">{li.timekeeper} {li.hours && `· ${li.hours}h @ $${li.rate}/hr`}</p>}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">${parseFloat(li.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <p className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="h-4 w-4" />{error}</p>}
            </div>
          )}
        </div>

        {/* Footer for review stage */}
        {stage === 'review' && (
          <div className="flex gap-3 p-6 border-t border-slate-200 flex-shrink-0">
            <button onClick={() => setStage('upload')} className="btn-secondary flex-1 justify-center">Back</button>
            <button onClick={handleSave} className="btn-primary flex-1 justify-center">
              <CheckCircle className="h-4 w-4" /> Save Invoice
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
