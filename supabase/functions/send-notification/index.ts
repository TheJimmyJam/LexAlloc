// Supabase Edge Function: send-notification
// Resolves org recipients + matter name from DB, sends typed email via Resend.
//
// POST body: { type, org_id, matter_id?, details }
//   type: 'invoice_parsed' | 'apportionment_run' | 'demand_letter_generated' | 'payment_status_updated'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { layout, infoRow, ctaButton } from '../_shared/emailTemplate.ts'

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM     = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL    = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const db = createClient(SUPABASE_URL, SERVICE_KEY)

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
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message ?? `Resend error ${res.status}`)
  }
}

function buildInvoiceParsed(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      A new invoice has been uploaded and parsed for matter <strong>${matterName}</strong>.
      Review the extracted data and run apportionment when ready.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Matter',       matterName)}
      ${d.invoice_number ? infoRow('Invoice #',    d.invoice_number) : ''}
      ${d.billing_firm   ? infoRow('Billing Firm', d.billing_firm)   : ''}
    </table>
    ${ctaButton('View Invoice', url, '#0ea5e9')}`
  return {
    subject: `[LexAlloc] New Invoice — ${matterName}`,
    html: layout({ title: 'New Invoice Uploaded', badgeText: 'Invoice', badgeColor: '#0ea5e9', body }),
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
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      An apportionment has been calculated for invoice <strong>${d.invoice_number ?? ''}</strong>
      in matter <strong>${matterName}</strong>. Demand letters are ready to generate.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Matter',    matterName)}
      ${d.invoice_number ? infoRow('Invoice #', d.invoice_number) : ''}
      ${d.method         ? infoRow('Method',    methodLabels[d.method] ?? d.method) : ''}
    </table>
    ${ctaButton('View Apportionment', url, '#7c3aed')}`
  return {
    subject: `[LexAlloc] Apportionment Ready — ${matterName}`,
    html: layout({ title: 'Apportionment Calculated', badgeText: 'Apportionment', badgeColor: '#7c3aed', body }),
  }
}

function buildDemandLetterGenerated(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}/apportionments/${d.apportionment_id ?? ''}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      A demand letter has been generated for <strong>${d.insurer_name ?? 'the insurer'}</strong>
      on invoice <strong>${d.invoice_number ?? ''}</strong> in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Matter',           matterName)}
      ${d.invoice_number ? infoRow('Invoice #', d.invoice_number) : ''}
      ${d.insurer_name   ? infoRow('Insurer',   d.insurer_name)   : ''}
      ${d.amount         ? infoRow('Amount',    d.amount)         : ''}
    </table>
    ${ctaButton('View Apportionment', url, '#f59e0b')}`
  return {
    subject: `[LexAlloc] Demand Letter Generated — ${d.insurer_name ?? ''} / ${matterName}`,
    html: layout({ title: 'Demand Letter Generated', badgeText: 'Demand Letter', badgeColor: '#f59e0b', body }),
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
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      Payment status has been updated for <strong>${d.insurer_name ?? 'an insurer'}</strong>
      in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Matter',     matterName)}
      ${d.insurer_name ? infoRow('Insurer',    d.insurer_name) : ''}
      ${infoRow('New Status', `<span style="background:${color}22;color:${color};padding:3px 10px;border-radius:20px;font-weight:600;font-size:12px;">${label}</span>`)}
      ${d.amount ? infoRow('Amount', d.amount) : ''}
    </table>
    ${ctaButton('View Matter', url, color)}`
  return {
    subject: `[LexAlloc] Payment ${label} — ${d.insurer_name ?? ''} / ${matterName}`,
    html: layout({ title: 'Payment Status Updated', badgeText: 'Payment', badgeColor: color, body }),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    })
  }
  try {
    const { type, org_id, matter_id, details = {} } = await req.json()
    if (!type || !org_id)
      return new Response(JSON.stringify({ error: 'type and org_id are required' }), { status: 400 })

    const [recipients, matterName] = await Promise.all([
      getOrgRecipients(org_id),
      getMatterName(matter_id),
    ])
    if (recipients.length === 0)
      return new Response(JSON.stringify({ sent: 0, message: 'No eligible recipients' }), { status: 200 })

    let email: { subject: string; html: string }
    switch (type) {
      case 'invoice_parsed':          email = buildInvoiceParsed(matterName, details, matter_id);          break
      case 'apportionment_run':       email = buildApportionmentRun(matterName, details, matter_id);       break
      case 'demand_letter_generated': email = buildDemandLetterGenerated(matterName, details, matter_id);  break
      case 'payment_status_updated':  email = buildPaymentStatusUpdated(matterName, details, matter_id);   break
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }), { status: 400 })
    }

    await sendEmail(recipients, email.subject, email.html)
    return new Response(JSON.stringify({ sent: recipients.length }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err: any) {
    console.error('send-notification error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
