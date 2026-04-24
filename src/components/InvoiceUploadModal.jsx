import { useState } from 'react'
import { X, Upload, FileText, CheckCircle } from 'lucide-react'
import { db } from '../lib/mockDb.js'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'

export default function InvoiceUploadModal({ matterId, profile, onClose }) {
  const [stage, setStage] = useState('form') // form | saving
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      invoice_number: '', billing_firm: '', invoice_date: '',
      service_start: '', service_end: '', total_amount: ''
    }
  })

  const onSubmit = (v) => {
    setStage('saving')
    setTimeout(() => {
      const inv = db.insert('invoices', {
        matter_id:      matterId,
        org_id:         profile.org_id,
        file_url:       null,
        invoice_number: v.invoice_number,
        invoice_date:   v.invoice_date,
        billing_firm:   v.billing_firm,
        total_amount:   parseFloat(v.total_amount) || 0,
        service_start:  v.service_start,
        service_end:    v.service_end,
        status:         'parsed',
        parsed_data:    {},
      })
      // Add a few placeholder line items
      db.insert('invoice_line_items', { invoice_id: inv.id, date_of_service: v.service_start, description: 'Legal services (see attached invoice for detail)', timekeeper: null, hours: null, rate: null, amount: parseFloat(v.total_amount)||0, category: 'fees' })
      toast.success('Invoice saved!')
      onClose()
    }, 800)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="font-semibold text-lg text-slate-900">Add Invoice</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400"/></button>
        </div>

        {stage === 'saving' ? (
          <div className="p-12 text-center">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">Saving invoice…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-blue-700 text-sm">
              <FileText className="h-4 w-4 flex-shrink-0 mt-0.5"/>
              <span>Demo mode — enter invoice details manually. In production, PDF upload + AI parsing handles this automatically.</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Invoice Number</label>
                <input className="form-input" placeholder="INV-2024-001" {...register('invoice_number')} />
              </div>
              <div>
                <label className="form-label">Invoice Date *</label>
                <input type="date" className="form-input" {...register('invoice_date', { required: true })} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Billing Firm *</label>
                <input className="form-input" placeholder="Wilson Burgess LLP" {...register('billing_firm', { required: true })} />
              </div>
              <div className="col-span-2">
                <label className="form-label">Total Amount ($) *</label>
                <input type="number" step="0.01" className="form-input" placeholder="45000.00" {...register('total_amount', { required: true })} />
              </div>
              <div>
                <label className="form-label">Service Period Start *</label>
                <input type="date" className="form-input" {...register('service_start', { required: true })} />
              </div>
              <div>
                <label className="form-label">Service Period End *</label>
                <input type="date" className="form-input" {...register('service_end', { required: true })} />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" className="btn-primary flex-1 justify-center"><Upload className="h-4 w-4"/> Save Invoice</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
