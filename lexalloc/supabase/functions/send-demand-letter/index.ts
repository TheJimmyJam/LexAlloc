// Supabase Edge Function: send-demand-letter
//
// Sends a formal demand email with the docx letter attached, marks the
// insurer apportionment as 'demanded', and logs the send in la_payment_reminders.
//
// Body:
//   insurer_apportionment_id  string  (required)
//   attachment_base64         string  (optional – docx in base64)
//   attachment_filename       string  (optional)
//   claims_rep_email          string  (optional – passed directly from frontend)
//   claims_rep_name           string  (optional)
//   insurer_name              string  (optional)
//   lexalloc_invoice_number   string  (optional)

// npm: specifiers are supported by Supabase Edge Functions natively (no esm.sh needed)
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Inline email template helpers ─────────────────────────────────────────────

const LOGO_HTML = `
<table cellpadding="0" cellspacing="0" role="presentation">
  <tr>
    <td style="vertical-align:middle;padding-right:14px;">
      <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-icon.png"
           alt="" width="60" height="60" style="display:block;border:0;border-radius:50%;" />
    </td>
    <td style="vertical-align:middle;">
      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">LexAlloc</span>
    </td>
  </tr>
</table>`

function badgeHtml(text: string, color: string): string {
  return `<span style="background:${color};color:#ffffff;font-size:11px;font-weight:700;
    padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${text}</span>`
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;
      width:38%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;
      font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      vertical-align:top;">${value}</td>
  </tr>`
}

function ctaButton(text: string, url: string, color = '#4f46e5'): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:28px;">
    <tr>
      <td style="background:${color};border-radius:8px;mso-padding-alt:0;">
        <a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;
          font-weight:600;font-size:14px;text-decoration:none;
          font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
          letter-spacing:0.1px;">${text} &rarr;</a>
      </td>
    </tr>
  </table>`
}

function layout(opts: { title: string; badgeText: string; badgeColor: string; body: string; footerNote?: string }): string {
  const { title, badgeText, badgeColor, body, footerNote } = opts
  return `<!DOCTYPE html><html lang="en"><head>
    <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title></head>
  <body style="margin:0;padding:0;background:#f1f5f9;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;">${title} — LexAlloc Legal Invoice Apportionment</div>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f1f5f9;padding:40px 16px;">
      <tr><td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
                <td align="left" style="vertical-align:middle;">${LOGO_HTML}</td>
                <td align="right" style="vertical-align:middle;white-space:nowrap;">${badgeHtml(badgeText, badgeColor)}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:28px 32px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${title}</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:20px 32px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 32px;">
              <p style="margin:0 0 6px;font-size:12px;color:#94a3b8;line-height:1.6;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                Legal Invoice Apportionment Platform &mdash;
                <a href="https://lexalloc.netlify.app" style="color:#94a3b8;text-decoration:underline;">lexalloc.netlify.app</a>
              </p>
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                You receive this email because you are a member of your organization's LexAlloc account.${footerNote ? `<br>${footerNote}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

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
    throw new Error((err as any).message ?? `Resend HTTP ${res.status}`)
  }
  return res.json()
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' },
    })
  }

  try {
    const body = await req.json()
    const {
      insurer_apportionment_id,
      attachment_base64,
      attachment_filename,
      claims_rep_email:       passedEmail,
      claims_rep_name:        passedRepName,
      insurer_name:           passedInsurerName,
      lexalloc_invoice_number: lexallocNum,
    } = body

    if (!insurer_apportionment_id) {
      return new Response(JSON.stringify({ error: 'insurer_apportionment_id required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // ── Fetch obligation ──────────────────────────────────────────────────────
    const { data: ia, error: iaErr } = await adminDb
      .from('la_insurer_apportionments')
      .select(`
        id, amount, payment_status, org_id, insurer_id, insurer_policy_period_id,
        insurers:la_insurers(name, contact_email),
        insurer_policy_periods:la_insurer_policy_periods(
          claims_rep_name, claims_rep_email, claim_number, billing_address
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
    const ippFk    = (ia as any).insurer_policy_periods   // may be null if FK is unset
    const appt     = (ia as any).apportionment
    const matter   = appt?.matters
    const invoice  = appt?.invoice
    const orgId    = ia.org_id as string
    const amount   = parseFloat(ia.amount) || 0

    // ── Resolve claims rep email ──────────────────────────────────────────────
    // Priority: passed from frontend > FK-joined policy period > fallback query by insurer_id > insurer contact
    let claimsEmail: string | null = passedEmail || ippFk?.claims_rep_email || null
    let claimsName:  string | null = passedRepName || ippFk?.claims_rep_name || null
    let claimNumber: string | null = ippFk?.claim_number || null

    // Fallback: if FK was null (common on older rows), query by insurer_id + matter_id
    if (!claimsEmail && (ia as any).insurer_id && appt?.matter_id) {
      const { data: ippFallback } = await adminDb
        .from('la_insurer_policy_periods')
        .select('claims_rep_email, claims_rep_name, claim_number')
        .eq('insurer_id', (ia as any).insurer_id)
        .eq('matter_id', appt.matter_id)
        .maybeSingle()
      if (ippFallback) {
        claimsEmail = ippFallback.claims_rep_email || null
        claimsName  = claimsName || ippFallback.claims_rep_name || null
        claimNumber = claimNumber || ippFallback.claim_number || null
      }
    }

    // Last resort: insurer's generic contact email
    if (!claimsEmail) claimsEmail = insurer?.contact_email || null

    const insurerName = passedInsurerName || insurer?.name || 'Unknown Insurer'
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
    const orgAdminEmails: string[] = ((admins ?? []) as any[]).map((r: any) => r.email).filter(Boolean)

    // ── Build email ───────────────────────────────────────────────────────────
    const salutation = claimsName ? `Dear ${claimsName}:` : 'Dear Sir or Madam:'
    const matterUrl  = `${FRONTEND_URL}/matters/${matterId}/apportionments/${apptId}`

    const serviceRange = invoice?.service_start
      ? fmtDate(invoice.service_start) +
        (invoice.service_end && invoice.service_end !== invoice.service_start
          ? ` through ${fmtDate(invoice.service_end)}` : '')
      : '—'

    const emailBody = `
      <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">${salutation}</p>
      <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        This letter constitutes a formal demand for payment of defense costs incurred in
        connection with the above-referenced matter. Please find the formal demand letter
        attached to this email. A summary of the obligation is provided below for your records.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
        ${infoRow('Matter',            matterName + matterNum)}
        ${infoRow('Invoice #',         invoiceNum)}
        ${infoRow('Invoice Date',      fmtDate(invoice?.invoice_date))}
        ${infoRow('Billing Firm',      invoice?.billing_firm ?? '—')}
        ${claimNumber ? infoRow('Claim No.', claimNumber) : ''}
        ${lexallocNum  ? infoRow('LexAlloc Invoice No.', lexallocNum) : ''}
        ${infoRow('Service Period',    serviceRange)}
        ${infoRow('Amount Due',        `<strong style="color:#0f172a;font-size:16px;">${fmt(amount)}</strong>`)}
      </table>
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        Payment of <strong>${fmt(amount)}</strong> is requested within thirty (30) days of
        the date of this letter. Please reference the matter name and invoice number on all
        correspondence and remittances to ensure proper application of payment.
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
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
    const toList      = claimsEmail ? [claimsEmail] : []
    const ccList      = orgAdminEmails.filter((e: string) => e !== claimsEmail)
    const effectiveTo = toList.length > 0 ? toList : ccList
    const effectiveCc = toList.length > 0 ? ccList  : []

    let sent   = false
    let sentTo = null as string | null

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

    return new Response(
      JSON.stringify({ sent, to: effectiveTo, claimsEmail, resolvedVia: passedEmail ? 'frontend' : ippFk ? 'fk_join' : 'fallback_query' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (err: any) {
    console.error('send-demand-letter error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
