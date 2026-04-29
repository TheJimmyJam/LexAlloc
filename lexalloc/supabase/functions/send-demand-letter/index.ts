// Supabase Edge Function: send-demand-letter
//
// Called by the frontend's "Generate All Letters" after generating each docx blob.
// Sends a formal demand email with the letter attached, marks the insurer
// apportionment as 'demanded', and logs the send in la_payment_reminders.
//
// Body: { insurer_apportionment_id: string, attachment_base64?: string, attachment_filename?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { layout, infoRow, ctaButton } from '../_shared/emailTemplate.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Email sender ──────────────────────────────────────────────────────────────

async function sendEmail(
  to: string[],
  cc: string[],
  subject: string,
  html: string,
  attachments: { filename: string; content: string }[],
) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const payload: Record<string, unknown> = { from: RESEND_FROM, to, subject, html }
  if (cc.length > 0)          payload.cc          = cc
  if (attachments.length > 0) payload.attachments = attachments
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message ?? `Resend error ${res.status}`)
  }
  return res.json()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    })
  }

  try {
    const body = await req.json()
    const { insurer_apportionment_id, attachment_base64, attachment_filename } = body

    if (!insurer_apportionment_id) {
      return new Response(JSON.stringify({ error: 'insurer_apportionment_id required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // ── Fetch obligation ──────────────────────────────────────────────────────
    const { data: ia, error: iaErr } = await adminDb
      .from('la_insurer_apportionments')
      .select(`
        id, amount, payment_status, org_id,
        insurers:la_insurers(name, contact_email),
        insurer_policy_periods:la_insurer_policy_periods(
          claims_rep_name, claims_rep_email, claim_number, billing_address
        ),
        party_apportionment:la_party_apportionments(
          percentage, amount,
          parties:la_parties(name)
        ),
        apportionment:la_apportionments(
          id, matter_id, calculation_method,
          invoice:la_invoices(invoice_number, invoice_date, billing_firm, total_amount, service_start, service_end),
          matters:la_matters(name, matter_number, id)
        )
      `)
      .eq('id', insurer_apportionment_id)
      .single()

    if (iaErr || !ia) throw new Error(iaErr?.message ?? 'Insurer apportionment not found')

    const insurer  = (ia as any).insurers
    const ipp      = (ia as any).insurer_policy_periods
    const appt     = (ia as any).apportionment
    const matter   = appt?.matters
    const invoice  = appt?.invoice
    const orgId    = ia.org_id as string
    const amount   = parseFloat(ia.amount) || 0

    const claimsEmail = ipp?.claims_rep_email || insurer?.contact_email || null
    const insurerName = insurer?.name ?? 'Unknown Insurer'
    const matterName  = matter?.name  ?? 'Unknown Matter'
    const matterNum   = matter?.matter_number ? ` (Matter No. ${matter.matter_number})` : ''
    const invoiceNum  = invoice?.invoice_number ?? '—'
    const matterId    = matter?.id ?? appt?.matter_id ?? ''
    const apptId      = appt?.id ?? ''

    // ── Org admins for CC ─────────────────────────────────────────────────────
    const { data: admins } = await adminDb
      .from('la_profiles')
      .select('email')
      .eq('org_id', orgId)
      .in('role', ['admin', 'user'])
    const orgAdminEmails = ((admins ?? []) as any[]).map((r: any) => r.email).filter(Boolean)

    // ── Build email ───────────────────────────────────────────────────────────
    const salutation = ipp?.claims_rep_name ? `Dear ${ipp.claims_rep_name}:` : 'Dear Sir or Madam:'
    const matterUrl  = `${FRONTEND_URL}/matters/${matterId}/apportionments/${apptId}`

    const serviceRange = invoice?.service_start
      ? fmtDate(invoice.service_start) +
        (invoice.service_end && invoice.service_end !== invoice.service_start
          ? ` through ${fmtDate(invoice.service_end)}` : '')
      : '—'

    const emailBody = `
      <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        ${salutation}
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        This letter constitutes a formal demand for payment of defense costs incurred in
        connection with the above-referenced matter. Please find the formal demand letter
        attached to this email. A summary of the obligation is provided below for your records.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
        ${infoRow('Matter',         matterName + matterNum)}
        ${infoRow('Invoice #',      invoiceNum)}
        ${infoRow('Invoice Date',   fmtDate(invoice?.invoice_date))}
        ${infoRow('Billing Firm',   invoice?.billing_firm ?? '—')}
        ${ipp?.claim_number ? infoRow('Claim No.', ipp.claim_number) : ''}
        ${infoRow('Service Period', serviceRange)}
        ${infoRow('Amount Due',     `<strong style="color:#0f172a;font-size:16px;">${fmt(amount)}</strong>`)}
      </table>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        Payment of <strong>${fmt(amount)}</strong> is requested within thirty (30) days of
        the date of this letter. Please reference the matter name and invoice number on all
        correspondence and remittances to ensure proper application of payment.
      </p>
      <p style="margin:0 0 0;font-size:13px;color:#64748b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        If you have any questions regarding this demand or the underlying calculation
        methodology, please do not hesitate to contact the issuing law firm.
      </p>
      ${ctaButton('View Matter', matterUrl, '#2E4057')}`

    const subject = `Formal Demand for Defense Costs — ${insurerName} / ${matterName} / Invoice ${invoiceNum}`
    const html    = layout({
      title:      `Formal Demand for Defense Costs — ${insurerName}`,
      badgeText:  'Demand Letter',
      badgeColor: '#2E4057',
      body:       emailBody,
      footerNote: 'If you have questions regarding this demand, please contact the issuing law firm directly.',
    })

    const attachments = attachment_base64 && attachment_filename
      ? [{ filename: attachment_filename, content: attachment_base64 }]
      : []

    // ── Determine recipients ──────────────────────────────────────────────────
    const toList     = claimsEmail ? [claimsEmail] : []
    const ccList     = orgAdminEmails.filter((e: string) => e !== claimsEmail)
    const effectiveTo = toList.length > 0 ? toList : ccList
    const effectiveCc = toList.length > 0 ? ccList  : []

    let sent    = false
    let sentTo  = null as string | null

    if (effectiveTo.length > 0) {
      await sendEmail(effectiveTo, effectiveCc, subject, html, attachments)
      sent   = true
      sentTo = effectiveTo[0]
    }

    // ── Mark as demanded ──────────────────────────────────────────────────────
    const now = new Date().toISOString()
    await adminDb
      .from('la_insurer_apportionments')
      .update({ payment_status: 'demanded', demanded_at: now })
      .eq('id', insurer_apportionment_id)

    // ── Log the send ──────────────────────────────────────────────────────────
    await adminDb.from('la_payment_reminders').insert({
      insurer_apportionment_id,
      org_id:         orgId,
      days_threshold: 0,
      email_to:       sentTo,
      triggered_by:   'manual',
      status:         sent ? 'sent' : 'failed',
      error_message:  sent ? null : 'No recipient email found',
    })

    return new Response(JSON.stringify({ sent, to: effectiveTo }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err: any) {
    console.error('send-demand-letter error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
