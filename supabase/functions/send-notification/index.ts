// Supabase Edge Function: send-notification
// Resolves org recipients + matter name from DB, sends typed email via Resend.
//
// POST body: { type, org_id, matter_id?, details }
//   type: 'invoice_parsed' | 'apportionment_run' | 'demand_letter_generated' | 'payment_status_updated'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')  ?? ''
const RESEND_FROM     = Deno.env.get('RESEND_FROM_EMAIL') ?? 'noreply@lexalloc.app'
const FRONTEND_URL    = Deno.env.get('FRONTEND_URL')     ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')     ?? ''
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ── Supabase admin client ─────────────────────────────────────────────────────

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgRecipients(orgId: string): Promise<string[]> {
  const { data } = await db
    .from('la_profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('role', ['admin', 'user'])
  return (data ?? []).map((r: any) => r.email).filter(Boolean)
}

async function getMatterName(matterId?: string): Promise<string> {
  if (!matterId) return 'Unknown Matter'
  const { data } = await db.from('la_matters').select('name').eq('id', matterId).single()
  return data?.name ?? 'Unknown Matter'
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Resend error ${res.status}`)
  }
  return res.json()
}

// ── Email layout ──────────────────────────────────────────────────────────────

function layout(title: string, badge: string, badgeColor: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="color:#fff;font-size:20px;font-weight:700;">LexAlloc</span></td>
              <td align="right"><span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;">${badge}</span></td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">${title}</h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f1f5f9;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
              Sent by <strong>LexAlloc</strong> &mdash; Legal Invoice Apportionment Platform.<br>
              You receive this because you are a member of your organization's LexAlloc account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:40%;">${label}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:500;">${value}</td>
  </tr>`
}

function cta(text: string, url: string, color = '#4f46e5'): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr>
    <td style="background:${color};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:12px 24px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;">${text}</a>
    </td>
  </tr></table>`
}

// ── Typed email builders ──────────────────────────────────────────────────────

function buildInvoiceParsed(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      A new invoice has been uploaded and parsed for matter <strong>${matterName}</strong>.
      Review the extracted line items and run apportionment when ready.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${row('Matter', matterName)}
      ${d.invoice_number ? row('Invoice #', d.invoice_number) : ''}
      ${d.billing_firm   ? row('Billing Firm', d.billing_firm) : ''}
    </table>
    ${cta('View Invoice &rarr;', url, '#0ea5e9')}`
  return {
    subject: `[LexAlloc] New Invoice Uploaded \u2014 ${matterName}`,
    html: layout('New Invoice Uploaded', 'Invoice', '#0ea5e9', body),
  }
}

function buildApportionmentRun(matterName: string, d: any, matterId: string) {
  const url = `${FRONTEND_URL}/matters/${matterId}/apportionments/${d.apportionment_id ?? ''}`
  const methodLabels: Record<string, string> = {
    pro_rata_time_on_risk: 'Pro-Rata Time-on-Risk',
    equal_shares:          'Equal Shares',
    limits_proportional:   'Limits-Proportional',
  }
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      An apportionment has been calculated for invoice <strong>${d.invoice_number ?? ''}</strong>
      in matter <strong>${matterName}</strong>. Demand letters are ready to generate.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${row('Matter', matterName)}
      ${d.invoice_number ? row('Invoice #', d.invoice_number) : ''}
      ${d.method         ? row('Method', methodLabels[d.method] ?? d.method) : ''}
    </table>
    ${cta('View Apportionment &rarr;', url, '#8b5cf6')}`
  return {
    subject: `[LexAlloc] Apportionment Ready \u2014 ${matterName}`,
    html: layout('Apportionment Calculated', 'Apportionment', '#8b5cf6', body),
  }
}

function buildDemandLetterGenerated(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}/apportionments/${d.apportionment_id ?? ''}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      A demand letter has been generated for <strong>${d.insurer_name ?? 'the insurer'}</strong>
      on invoice <strong>${d.invoice_number ?? ''}</strong> in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${row('Matter', matterName)}
      ${d.invoice_number ? row('Invoice #', d.invoice_number) : ''}
      ${d.insurer_name   ? row('Insurer', d.insurer_name) : ''}
      ${d.amount         ? row('Amount Demanded', d.amount) : ''}
    </table>
    ${cta('View Apportionment &rarr;', url, '#f59e0b')}`
  return {
    subject: `[LexAlloc] Demand Letter Generated \u2014 ${d.insurer_name ?? ''} / ${matterName}`,
    html: layout('Demand Letter Generated', 'Demand Letter', '#f59e0b', body),
  }
}

function buildPaymentStatusUpdated(matterName: string, d: any, matterId: string) {
  const url = d.apportionment_id
    ? `${FRONTEND_URL}/matters/${matterId}/apportionments/${d.apportionment_id}`
    : `${FRONTEND_URL}/matters/${matterId}`
  const statusLabels: Record<string, string> = {
    pending: 'Pending', demanded: 'Demanded', paid: 'Paid',
    partially_paid: 'Partially Paid', disputed: 'Disputed',
  }
  const statusColors: Record<string, string> = {
    paid: '#16a34a', partially_paid: '#2563eb', disputed: '#dc2626',
    demanded: '#d97706', pending: '#64748b',
  }
  const label = statusLabels[d.new_status] ?? d.new_status ?? ''
  const color = statusColors[d.new_status] ?? '#64748b'
  const body  = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      Payment status has been updated for <strong>${d.insurer_name ?? 'an insurer'}</strong>
      in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${row('Matter', matterName)}
      ${d.insurer_name ? row('Insurer', d.insurer_name) : ''}
      ${row('New Status', `<span style="background:${color}22;color:${color};padding:2px 10px;border-radius:20px;font-weight:600;font-size:12px;">${label}</span>`)}
      ${d.amount ? row('Amount', d.amount) : ''}
    </table>
    ${cta('View Matter &rarr;', url, color)}`
  return {
    subject: `[LexAlloc] Payment Status Updated \u2014 ${d.insurer_name ?? ''} marked ${label}`,
    html: layout('Payment Status Updated', 'Payment', color, body),
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  try {
    const { type, org_id, matter_id, details = {} } = await req.json()

    if (!type || !org_id) {
      return new Response(JSON.stringify({ error: 'type and org_id are required' }), { status: 400 })
    }

    const [recipients, matterName] = await Promise.all([
      getOrgRecipients(org_id),
      getMatterName(matter_id),
    ])

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No eligible recipients' }), { status: 200 })
    }

    let email: { subject: string; html: string }

    switch (type) {
      case 'invoice_parsed':
        email = buildInvoiceParsed(matterName, details, matter_id)
        break
      case 'apportionment_run':
        email = buildApportionmentRun(matterName, details, matter_id)
        break
      case 'demand_letter_generated':
        email = buildDemandLetterGenerated(matterName, details, matter_id)
        break
      case 'payment_status_updated':
        email = buildPaymentStatusUpdated(matterName, details, matter_id)
        break
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 })
    }

    await sendEmail(recipients, email.subject, email.html)
    return new Response(JSON.stringify({ sent: recipients.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err: any) {
    console.error('send-notification error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
