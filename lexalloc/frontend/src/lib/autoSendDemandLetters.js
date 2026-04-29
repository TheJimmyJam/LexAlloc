/**
 * autoSendDemandLetters
 *
 * Generates and emails demand letters for every insurer apportionment
 * on a given apportionment ID. Called automatically after auto-apportion
 * in InvoiceUploadModal, and usable anywhere else.
 *
 * Returns { sent, skipped, errors, total }
 */

import { supabase } from './supabase.js'
import { generateDemandLetterBlob, getDemandLetterFilename } from './generateDemandLetter.js'

// ── LexAlloc invoice number (same logic as Apportionment.jsx) ─────────────────

async function getOrCreateLexAllocNumber(ia, inv, matter) {
  if (ia.lexalloc_invoice_number) return ia.lexalloc_invoice_number

  const abbr = (str, len) =>
    (str || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len).padEnd(len, 'X')

  const insurerAbbr = abbr(ia.insurers?.name, 4)
  const firmAbbr    = abbr(inv.billing_firm,  4)
  const matterCode  = (matter?.matter_number || '')
    .replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'MTR'
  const invoiceDate = inv.invoice_date ? new Date(inv.invoice_date) : new Date()
  const dateCode    = `${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}`
  const prefix      = `${insurerAbbr}.${firmAbbr}.${matterCode}`

  const { count } = await supabase
    .from('la_insurer_apportionments')
    .select('id', { count: 'exact', head: true })
    .not('lexalloc_invoice_number', 'is', null)
    .like('lexalloc_invoice_number', `${prefix}.%`)

  const seq    = String((count || 0) + 1).padStart(3, '0')
  const number = `${prefix}.${dateCode}.${seq}`

  await supabase
    .from('la_insurer_apportionments')
    .update({ lexalloc_invoice_number: number })
    .eq('id', ia.id)

  return number
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function autoSendDemandLetters({ apportionmentId, orgName = '', download = false }) {
  // 1. Fetch full apportionment with all nested data
  const { data: apport, error: fetchErr } = await supabase
    .from('la_apportionments')
    .select(`
      id, matter_id,
      matters:la_matters(name, matter_number, org_id),
      invoices:la_invoices(invoice_number, invoice_date, billing_firm, service_start, service_end, total_amount),
      party_apportionments:la_party_apportionments(
        id,
        insurer_apportionments:la_insurer_apportionments(
          id, insurer_id, amount, lexalloc_invoice_number,
          insurers:la_insurers(name, contact_email),
          insurer_policy_periods:la_insurer_policy_periods(claims_rep_name, claims_rep_email, claim_number, billing_address)
        )
      )
    `)
    .eq('id', apportionmentId)
    .single()

  if (fetchErr || !apport) throw new Error('Could not load apportionment for demand letters')

  const inv    = apport.invoices || {}
  const matter = apport.matters  || {}

  const allPairs = (apport.party_apportionments || []).flatMap(pa =>
    (pa.insurer_apportionments || [])
      .filter(ia => parseFloat(ia.amount) > 0)
      .map(ia => ({ pa, ia }))
  )

  if (!allPairs.length) return { sent: 0, skipped: 0, errors: [], total: 0 }

  // 2. Bulk-fetch insurer policy periods for this matter
  const { data: ippRows } = await supabase
    .from('la_insurer_policy_periods')
    .select('id, insurer_id, claims_rep_name, claims_rep_email, billing_address, claim_number')
    .eq('matter_id', apport.matter_id)

  const ippByInsurer = {}
  for (const row of (ippRows || [])) {
    if (!ippByInsurer[row.insurer_id]) ippByInsurer[row.insurer_id] = row
  }

  // 3. Fallback fetch for any insurer not found by matter_id
  const allInsurerIds = allPairs.map(({ ia }) => ia.insurer_id).filter(Boolean)
  const missing = allInsurerIds.filter(id => id && !ippByInsurer[id])
  if (missing.length > 0) {
    const { data: fallbackRows } = await supabase
      .from('la_insurer_policy_periods')
      .select('id, insurer_id, claims_rep_name, claims_rep_email, billing_address, claim_number')
      .in('insurer_id', missing)
    for (const row of (fallbackRows || [])) {
      if (!ippByInsurer[row.insurer_id]) ippByInsurer[row.insurer_id] = row
    }
  }

  let sent = 0, skipped = 0
  const errors = []

  // 4. Generate + send each letter
  for (let i = 0; i < allPairs.length; i++) {
    const { pa, ia } = allPairs[i]
    if (i > 0) await new Promise(r => setTimeout(r, 400))

    try {
      const lexallocInvoiceNumber = await getOrCreateLexAllocNumber(ia, inv, matter)
      const blob     = await generateDemandLetterBlob({ apport, invoice: inv, pa, ia, orgName, lexallocInvoiceNumber })
      const filename = getDemandLetterFilename({ apport, invoice: inv, ia })

      // Optional browser download (for manual "Generate All" usage)
      if (download) {
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href = url; a.download = filename
        document.body.appendChild(a); a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      // Convert blob → base64 for email attachment
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let binary = ''
      uint8.forEach(b => { binary += String.fromCharCode(b) })
      const base64 = btoa(binary)

      // Resolve contact info
      const ipp         = ippByInsurer[ia.insurer_id] || ia.insurer_policy_periods || {}
      const claimsEmail = ipp.claims_rep_email || ia.insurers?.contact_email || null

      const { error: fnErr } = await supabase.functions.invoke('send-demand-letter', {
        body: {
          insurer_apportionment_id: ia.id,
          attachment_base64:        base64,
          attachment_filename:      filename,
          claims_rep_email:         claimsEmail,
          claims_rep_name:          ipp.claims_rep_name || null,
          insurer_name:             ia.insurers?.name   || null,
          lexalloc_invoice_number:  lexallocInvoiceNumber,
        },
      })
      if (fnErr) throw new Error(fnErr.message || JSON.stringify(fnErr))

      if (claimsEmail) sent++
      else skipped++

    } catch (err) {
      const ipp         = ippByInsurer[ia.insurer_id] || ia.insurer_policy_periods || {}
      const claimsEmail = ipp.claims_rep_email || ia.insurers?.contact_email || null
      if (claimsEmail) {
        errors.push({ name: ia.insurers?.name, msg: err.message })
      } else {
        skipped++
      }
    }
  }

  return { sent, skipped, errors, total: allPairs.length }
}
