import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  sendInvoiceParsed,
  sendApportionmentReady,
  sendDemandLetterGenerated,
  sendPaymentStatusUpdated,
} from '../services/emailService.js'

const router = Router()

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgRecipients(orgId) {
  const { data } = await supabaseAdmin
    .from('la_profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('role', ['admin', 'user'])
    .not('email', 'is', null)
  return (data || []).map(p => p.email).filter(Boolean)
}

async function getMatterName(matterId) {
  if (!matterId) return null
  const { data } = await supabaseAdmin
    .from('la_matters')
    .select('name')
    .eq('id', matterId)
    .single()
  return data?.name || null
}

// ── POST /api/notifications/send  (generic, kept for back-compat) ─────────────
router.post('/send', async (req, res, next) => {
  try {
    const { to, subject, html, matter_name } = req.body
    if (!to || !subject) return res.status(400).json({ error: 'to and subject are required' })
    const result = await sendEmail({
      to,
      subject,
      html: html || `<p>LexAlloc notification regarding matter: <strong>${matter_name}</strong></p>`,
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ── POST /api/notifications/event  (smart typed events) ──────────────────────
// Body: { type, org_id, matter_id?, details }
//
// types:
//   invoice_parsed         details: { invoice_number, billing_firm }
//   apportionment_run      details: { invoice_number, method, apportionment_id }
//   demand_letter_generated details: { invoice_number, insurer_name, amount, apportionment_id }
//   payment_status_updated  details: { insurer_name, new_status, amount, apportionment_id }
//
router.post('/event', async (req, res, next) => {
  try {
    const { type, org_id, matter_id, details = {} } = req.body

    if (!type || !org_id) {
      return res.status(400).json({ error: 'type and org_id are required' })
    }

    // Resolve recipients + matter name in parallel
    const [recipients, matterName] = await Promise.all([
      getOrgRecipients(org_id),
      getMatterName(matter_id),
    ])

    if (recipients.length === 0) {
      return res.json({ sent: 0, message: 'No eligible recipients found' })
    }

    const name = matterName || 'Unknown Matter'

    switch (type) {
      case 'invoice_parsed':
        await sendInvoiceParsed({
          to:          recipients,
          matterName:  name,
          invoiceNumber: details.invoice_number,
          billingFirm: details.billing_firm,
          matterId:    matter_id,
        })
        break

      case 'apportionment_run':
        await sendApportionmentReady({
          to:             recipients,
          matterName:     name,
          invoiceNumber:  details.invoice_number,
          method:         details.method,
          matterId:       matter_id,
          apportionmentId: details.apportionment_id,
        })
        break

      case 'demand_letter_generated':
        await sendDemandLetterGenerated({
          to:             recipients,
          matterName:     name,
          invoiceNumber:  details.invoice_number,
          insurerName:    details.insurer_name,
          amount:         details.amount,
          matterId:       matter_id,
          apportionmentId: details.apportionment_id,
        })
        break

      case 'payment_status_updated':
        await sendPaymentStatusUpdated({
          to:             recipients,
          matterName:     name,
          insurerName:    details.insurer_name,
          newStatus:      details.new_status,
          amount:         details.amount,
          matterId:       matter_id,
          apportionmentId: details.apportionment_id,
        })
        break

      default:
        return res.status(400).json({ error: `Unknown event type: ${type}` })
    }

    res.json({ sent: recipients.length })
  } catch (err) {
    next(err)
  }
})

export default router
