import { useState } from 'react'
import { X, Download, Mail, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { generateDemandLetterBlob, getDemandLetterFilename } from '../lib/generateDemandLetter.js'
import { formatCurrency, formatPercent } from '../lib/calculations.js'
import { supabase } from '../lib/supabase.js'
import toast from 'react-hot-toast'

// ─── HTML preview (mirrors letter layout without generating docx) ─────────────

function LetterPreview({ data }) {
  const { apport, invoice, pa, ia, orgName } = data
  const pp     = ia.insurer_policy_periods
  const today  = format(new Date(), 'MMMM d, yyyy')
  const method = apport.calculation_method || 'pro_rata_time_on_risk'

  const fmtD = (d) => d ? format(typeof d === 'string' ? parseISO(d) : d, 'MMMM d, yyyy') : '—'

  const RE_LINES = [
    `${apport.matters?.name || 'Matter'}${apport.matters?.matter_number ? ` (Matter No. ${apport.matters.matter_number})` : ''}`,
    pp?.claim_number           ? `Claim No. ${pp.claim_number}` : null,
    ia.insurers?.policy_number ? `Policy No. ${ia.insurers.policy_number}` : null,
    `Invoice No. ${invoice.invoice_number || '—'} dated ${fmtD(invoice.invoice_date)}`,
  ].filter(Boolean)

  const calcDesc = () => {
    const pct = formatPercent(ia.percentage)
    if (method === 'equal_shares') {
      const n = pa.insurer_apportionments?.length || 1
      return `Defense costs for ${pa.parties?.name || 'this party'} have been allocated equally among ${n} triggered carrier${n !== 1 ? 's' : ''}, resulting in an equal share of ${pct} for ${ia.insurers?.name || 'the insurer'}.`
    }
    if (method === 'limits_proportional') {
      const limit = pp?.policy_limit ? formatCurrency(pp.policy_limit) : '[policy limit on file]'
      return `Defense costs have been allocated proportionally based on policy limits. ${ia.insurers?.name || 'The insurer'}'s policy limit of ${limit} represents ${pct} of total limits across all triggered policies for this party.`
    }
    return `Defense costs have been allocated on a pro-rata time-on-risk basis. ${ia.insurers?.name || 'The insurer'}'s policy was on-risk for ${ia.days_on_risk ?? '—'} of the ${ia.total_days ?? '—'} days in the service period, representing ${pct} of total exposure.`
  }

  const s = (obj = {}) => ({ fontFamily: 'Georgia, serif', fontSize: '13px', lineHeight: '1.6', color: '#1a1a1a', ...obj })

  return (
    <div style={s()}>
      {/* Letterhead */}
      <div style={{ borderBottom: '2.5px solid #2E4057', paddingBottom: '8px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <strong style={{ fontSize: '17px', color: '#2E4057' }}>{orgName || '[Law Firm Name]'}</strong>
        <span style={{ color: '#666', fontSize: '12px' }}>{today}</span>
      </div>

      {/* Addressee */}
      <div style={{ marginBottom: '20px' }}>
        {ia.insurers?.name    && <div style={{ fontWeight: 'bold' }}>{ia.insurers.name}</div>}
        {pp?.claims_rep_name  && <div>{pp.claims_rep_name}</div>}
        {pp?.billing_address
          ? pp.billing_address.split('\n').map((l, i) => <div key={i}>{l}</div>)
          : <div style={{ color: '#aaa', fontSize: '12px', fontStyle: 'italic' }}>No billing address on file</div>}
      </div>

      {/* Re: */}
      <table style={{ marginBottom: '20px', borderSpacing: 0 }}>
        <tbody>
          {RE_LINES.map((line, i) => (
            <tr key={i}>
              <td style={{ fontWeight: 'bold', paddingRight: '14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {i === 0 ? 'Re:' : ''}
              </td>
              <td>{line}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Salutation */}
      <p style={{ marginBottom: '16px' }}>
        {pp?.claims_rep_name ? `Dear ${pp.claims_rep_name}:` : 'Dear Sir or Madam:'}
      </p>

      <p style={{ marginBottom: '20px' }}>
        This letter constitutes a formal demand for payment of defense costs incurred in connection with the above-referenced matter. Please review the following apportionment calculation and remit payment in the amount set forth below.
      </p>

      {/* Invoice Summary */}
      <div style={{ fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.1em', borderBottom: '1.5px solid #2E4057', paddingBottom: '3px', marginBottom: '10px', color: '#2E4057' }}>
        INVOICE SUMMARY
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#EDF0F5' }}>
            {['Invoice Number', 'Invoice Date', 'Billing Firm', 'Total Amount'].map(h => (
              <th key={h} style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #ccc', fontWeight: 'bold' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}>{invoice.invoice_number || '—'}</td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}>{fmtD(invoice.invoice_date)}</td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}>{invoice.billing_firm || '—'}</td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{formatCurrency(invoice.total_amount)}</td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: '12px', marginBottom: '20px' }}>
        <strong>Service Period:</strong>{' '}
        {fmtD(invoice.service_start)}
        {invoice.service_end && invoice.service_end !== invoice.service_start ? ` through ${fmtD(invoice.service_end)}` : ''}
      </p>

      {/* Allocated Obligation */}
      <div style={{ fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.1em', borderBottom: '1.5px solid #2E4057', paddingBottom: '3px', marginBottom: '10px', color: '#2E4057' }}>
        ALLOCATED OBLIGATION
      </div>
      <p style={{ marginBottom: '10px' }}>
        {pa.parties?.name || 'The insured party'} bears {formatPercent(pa.percentage)} of the defense obligation for this invoice, corresponding to a total party obligation of {formatCurrency(pa.amount)}.
      </p>
      <p style={{ marginBottom: '12px' }}>{calcDesc()}</p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#EDF0F5' }}>
            <th style={{ padding: '5px 8px', textAlign: 'left', border: '1px solid #ccc', fontWeight: 'bold' }}>Description</th>
            <th style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #ccc', fontWeight: 'bold' }}>Percentage</th>
            <th style={{ padding: '5px 8px', textAlign: 'right', border: '1px solid #ccc', fontWeight: 'bold' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}>{pa.parties?.name || 'Party'} share of invoice</td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{formatPercent(pa.percentage)}</td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{formatCurrency(pa.amount)}</td>
          </tr>
          {method === 'pro_rata_time_on_risk' && (
            <tr>
              <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}>
                {ia.insurers?.name || 'Insurer'} time-on-risk ({ia.days_on_risk ?? '—'} / {ia.total_days ?? '—'} days)
              </td>
              <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right' }}>{formatPercent(ia.percentage)}</td>
              <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}></td>
            </tr>
          )}
          <tr style={{ background: '#EDF0F5' }}>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc', fontWeight: 'bold' }}>
              Total due from {ia.insurers?.name || 'Insurer'}
            </td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc' }}></td>
            <td style={{ padding: '5px 8px', border: '1px solid #ccc', textAlign: 'right', fontWeight: 'bold', color: '#1a4480', fontSize: '14px' }}>
              {formatCurrency(ia.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Payment Instructions */}
      <div style={{ fontWeight: 'bold', fontSize: '11px', letterSpacing: '0.1em', borderBottom: '1.5px solid #2E4057', paddingBottom: '3px', marginBottom: '10px', color: '#2E4057' }}>
        PAYMENT INSTRUCTIONS
      </div>
      <p style={{ marginBottom: '10px' }}>
        Payment of {formatCurrency(ia.amount)} is requested within thirty (30) days of the date of this letter.
      </p>
      <p style={{ marginBottom: '20px', color: '#AA2200', fontWeight: 'bold' }}>
        [PAYMENT INSTRUCTIONS / REMITTANCE ADDRESS]
      </p>

      {/* Closing */}
      <p style={{ marginBottom: '40px' }}>
        If you have any questions regarding this demand or the underlying calculation methodology, please do not hesitate to contact the undersigned.
      </p>
      <p>Very truly yours,</p>
      <div style={{ marginTop: '44px', marginBottom: '4px', borderBottom: '1px solid #555', width: '220px' }}></div>
      <div style={{ fontWeight: 'bold' }}>{orgName || '[Law Firm Name]'}</div>
      <div>[Attorney Name]</div>
      <div>[Phone] | [Email]</div>

      <div style={{ borderTop: '1px solid #ddd', marginTop: '32px', paddingTop: '8px', textAlign: 'center', fontSize: '10px', color: '#999', fontStyle: 'italic' }}>
        ATTORNEY WORK PRODUCT — PRIVILEGED AND CONFIDENTIAL
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function DemandLetterModal({ data, onClose, onDemanded }) {
  const [downloading, setDownloading] = useState(false)
  const [markDemanded, setMarkDemanded] = useState(true)

  const alreadyDemanded = data.ia.payment_status === 'demanded' ||
                          data.ia.payment_status === 'paid'

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob     = await generateDemandLetterBlob(data)
      const filename = getDemandLetterFilename(data)

      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      if (markDemanded && !alreadyDemanded) {
        const { error } = await supabase
          .from('la_insurer_apportionments')
          .update({
            payment_status: 'demanded',
            demanded_at:    new Date().toISOString(),
          })
          .eq('id', data.ia.id)

        if (error) {
          toast.error(`Downloaded but failed to update status: ${error.message}`)
        } else {
          toast.success('Letter downloaded — status marked Demanded')
          onDemanded?.()
        }
      } else {
        toast.success(`${filename} downloaded`)
      }

      onClose()
    } catch (err) {
      toast.error(`Failed to generate letter: ${err.message}`)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-brand-600" />
              <h2 className="font-semibold text-lg text-slate-900">Demand Letter Preview</h2>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {data.ia.insurers?.name}
              <span className="mx-2 text-slate-300">·</span>
              <span className="font-semibold text-slate-700">{formatCurrency(data.ia.amount)}</span> obligation
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Missing info warning */}
        {(!data.ia.insurer_policy_periods?.billing_address || !data.ia.insurer_policy_periods?.claims_rep_name) && (
          <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 border-b border-amber-100 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            Some carrier contact details are missing. Add them under the insurer policy period to complete the letter header.
          </div>
        )}

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-10 max-w-2xl mx-auto">
            <LetterPreview data={data} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 flex items-center justify-between gap-4 flex-shrink-0">
          {!alreadyDemanded ? (
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={markDemanded}
                onChange={e => setMarkDemanded(e.target.checked)}
              />
              Mark <strong className="mx-1">{data.ia.insurers?.name}</strong> as Demanded on download
            </label>
          ) : (
            <p className="text-sm text-slate-400 italic">Status already: {data.ia.payment_status}</p>
          )}

          <div className="flex gap-3 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handleDownload} className="btn-primary" disabled={downloading}>
              {downloading
                ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> Generating…</>
                : <><Download className="h-4 w-4" /> Download .docx</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
