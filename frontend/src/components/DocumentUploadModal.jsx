import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.jsx'
import toast from 'react-hot-toast'

export const DOC_TYPES = [
  { value: 'coverage_opinion',      label: 'Coverage Opinion',           color: 'bg-blue-100 text-blue-700'    },
  { value: 'ror_letter',            label: 'Reservation of Rights',      color: 'bg-amber-100 text-amber-700'  },
  { value: 'settlement_agreement',  label: 'Settlement Agreement',       color: 'bg-green-100 text-green-700'  },
  { value: 'demand_letter',         label: 'Demand Letter',              color: 'bg-red-100 text-red-700'      },
  { value: 'court_filing',          label: 'Court Filing / Pleading',    color: 'bg-purple-100 text-purple-700'},
  { value: 'mediation_brief',       label: 'Mediation Brief',            color: 'bg-cyan-100 text-cyan-700'    },
  { value: 'expert_report',         label: 'Expert Report',              color: 'bg-indigo-100 text-indigo-700'},
  { value: 'other',                 label: 'Other',                      color: 'bg-slate-100 text-slate-600'  },
]

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function DocumentUploadModal({ matterId, onClose, onUploaded }) {
  const { profile } = useAuth()
  const [file, setFile]       = useState(null)
  const [name, setName]       = useState('')
  const [docType, setDocType] = useState('coverage_opinion')
  const [notes, setNotes]     = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError]     = useState(null)

  const onDrop = useCallback((accepted) => {
    const f = accepted[0]
    if (!f) return
    setFile(f)
    setError(null)
    // Pre-fill display name from filename (strip extension)
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''))
  }, [name])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    maxSize: 52428800, // 50 MB
    onDropRejected: (files) => {
      const err = files[0]?.errors[0]
      setError(err?.code === 'file-too-large' ? 'File exceeds 50 MB limit.' : err?.message || 'File rejected.')
    },
  })

  const handleUpload = async () => {
    if (!file || !name.trim()) return
    setUploading(true)
    setError(null)

    try {
      const ext  = file.name.includes('.') ? file.name.split('.').pop() : ''
      const path = `${profile.org_id}/matters/${matterId}/${Date.now()}-${file.name}`

      const { error: storageErr } = await supabase.storage
        .from('la_documents')
        .upload(path, file, { contentType: file.type })
      if (storageErr) throw storageErr

      const { error: dbErr } = await supabase.from('la_matter_documents').insert({
        matter_id:   matterId,
        org_id:      profile.org_id,
        uploaded_by: profile.id,
        name:        name.trim(),
        doc_type:    docType,
        file_path:   path,
        file_name:   file.name,
        file_size:   file.size,
        file_mime:   file.type || `application/${ext}`,
        notes:       notes.trim() || null,
      })
      if (dbErr) throw dbErr

      toast.success('Document uploaded!')
      onUploaded?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Upload failed.')
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg text-slate-900">Upload Document</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Drop zone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-8 w-8 text-brand-600 flex-shrink-0" />
                <div className="text-left">
                  <p className="font-medium text-slate-800 text-sm">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setFile(null); setName('') }}
                  className="ml-2 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">Drop file here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, XLSX, images — up to 50 MB</p>
              </>
            )}
          </div>

          {/* Display name */}
          <div>
            <label className="form-label">Display Name *</label>
            <input
              className="form-input"
              placeholder="e.g. Travelers ROR Letter — March 2024"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Document type */}
          <div>
            <label className="form-label">Document Type</label>
            <select className="form-input" value={docType} onChange={e => setDocType(e.target.value)}>
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="form-label">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              className="form-input h-16 resize-none"
              placeholder="Brief description or context…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
            </p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button
            onClick={handleUpload}
            disabled={!file || !name.trim() || uploading}
            className="btn-primary flex-1 justify-center"
          >
            {uploading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
              : <><CheckCircle className="h-4 w-4" /> Save Document</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
