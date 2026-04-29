// Supabase Edge Function: send-notification
// No external imports — uses native fetch against the Supabase REST API directly.
//
// POST body: { type, org_id, matter_id?, details }
//   type: 'invoice_parsed' | 'apportionment_run' | 'demand_letter_generated' | 'payment_status_updated' | 'party_info_request'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────

const DB_HEADERS = {
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
  'Content-Type':  'application/json',
}

async function dbGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: DB_HEADERS })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`DB GET ${path}: ${res.status} ${txt}`)
  }
  return res.json()
}

// ── Email template helpers (inlined from _shared/emailTemplate.ts) ────────────

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:38%;font-family:sans-serif;vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:500;font-family:sans-serif;vertical-align:top;">${value}</td>
  </tr>`
}

function ctaButton(text: string, url: string, color = '#4f46e5'): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr>
    <td style="background:${color};border-radius:8px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;font-family:sans-serif;">${text} &rarr;</a>
    </td>
  </tr></table>`
}

function badge(text: string, color: string): string {
  return `<span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;font-family:sans-serif;">${text}</span>`
}

function layout(opts: { title: string; badgeText: string; badgeColor: string; body: string; footerNote?: string }): string {
  const { title, badgeText, badgeColor, body, footerNote } = opts
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="display:none;">${title} — LexAlloc</div>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1);">
  <tr><td style="background:linear-gradient(135deg,#0f172a,#1e1b4b);padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:14px;vertical-align:middle;">
          <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-icon.png" width="60" height="60" style="display:block;border-radius:50%;" />
        </td>
        <td style="vertical-align:middle;">
          <span style="color:#fff;font-size:22px;font-weight:700;font-family:sans-serif;">LexAlloc</span>
        </td>
      </tr></table></td>
      <td align="right">${badge(badgeText, badgeColor)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#fff;padding:28px 32px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;font-family:sans-serif;">${title}</h1>
  </td></tr>
  <tr><td style="background:#fff;padding:20px 32px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">${body}</td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 14px 14px;padding:20px 32px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;font-family:sans-serif;">
      Legal Invoice Apportionment Platform &mdash; <a href="https://lexalloc.com" style="color:#94a3b8;">lexalloc.com</a><br>
      You receive this email because you are a member of your organization's LexAlloc account.${footerNote ? `<br>${footerNote}` : ''}
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getOrgRecipients(orgId: string): Promise<string[]> {
  const rows = await dbGet(
    `la_profiles?org_id=eq.${orgId}&role=in.(admin,user)&notifications_muted=eq.false&select=email`
  ).catch(() => [])
  return (rows ?? []).map((r: any) => r.email).filter(Boolean)
}

async function getMatterName(matterId?: string): Promise<string> {
  if (!matterId) return 'Unknown Matter'
  const rows = await dbGet(`la_matters?id=eq.${matterId}&select=name&limit=1`).catch(() => [])
  return rows?.[0]?.name ?? 'Unknown Matter'
}

// ── Email builders ────────────────────────────────────────────────────────────

function buildInvoiceParsed(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      A new invoice has been uploaded and parsed for matter <strong>${matterName}</strong>.
      Review the extracted data and run apportionment when ready.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow('Matter', matterName)}
      ${d.invoice_number ? infoRow('Invoice #',    d.invoice_number) : ''}
      ${d.billing_firm   ? infoRow('Billing Firm', d.billing_firm)   : ''}
    </table>
    ${ctaButton('View Invoice', url, '#0ea5e9')}`
  return {
    subject: `[LexAlloc] New Invoice — ${matterName}`,
    html:    layout({ title: 'New Invoice Uploaded', badgeText: 'Invoice', badgeColor: '#0ea5e9', body }),
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
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      An apportionment has been calculated for invoice <strong>${d.invoice_number ?? ''}</strong>
      in matter <strong>${matterName}</strong>. Demand letters are ready to generate.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow('Matter',    matterName)}
      ${d.invoice_number ? infoRow('Invoice #', d.invoice_number) : ''}
      ${d.method         ? infoRow('Method',    methodLabels[d.method] ?? d.method) : ''}
    </table>
    ${ctaButton('View Apportionment', url, '#7c3aed')}`
  return {
    subject: `[LexAlloc] Apportionment Ready — ${matterName}`,
    html:    layout({ title: 'Apportionment Calculated', badgeText: 'Apportionment', badgeColor: '#7c3aed', body }),
  }
}

function buildDemandLetterGenerated(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}/apportionments/${d.apportionment_id ?? ''}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      A demand letter has been generated for <strong>${d.insurer_name ?? 'the insurer'}</strong>
      on invoice <strong>${d.invoice_number ?? ''}</strong> in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow('Matter',    matterName)}
      ${d.invoice_number ? infoRow('Invoice #', d.invoice_number) : ''}
      ${d.insurer_name   ? infoRow('Insurer',   d.insurer_name)   : ''}
      ${d.amount         ? infoRow('Amount',    d.amount)         : ''}
    </table>
    ${ctaButton('View Apportionment', url, '#f59e0b')}`
  return {
    subject: `[LexAlloc] Demand Letter Generated — ${d.insurer_name ?? ''} / ${matterName}`,
    html:    layout({ title: 'Demand Letter Generated', badgeText: 'Demand Letter', badgeColor: '#f59e0b', body }),
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
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      Payment status has been updated for <strong>${d.insurer_name ?? 'an insurer'}</strong>
      in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${infoRow('Matter',     matterName)}
      ${d.insurer_name ? infoRow('Insurer',    d.insurer_name) : ''}
      ${infoRow('New Status', `<span style="background:${color}22;color:${color};padding:3px 10px;border-radius:20px;font-weight:600;font-size:12px;">${label}</span>`)}
      ${d.amount ? infoRow('Amount', d.amount) : ''}
    </table>
    ${ctaButton('View Matter', url, color)}`
  return {
    subject: `[LexAlloc] Payment ${label} — ${d.insurer_name ?? ''} / ${matterName}`,
    html:    layout({ title: 'Payment Status Updated', badgeText: 'Payment', badgeColor: color, body }),
  }
}

function buildPartyInfoRequest(matterName: string, d: any, matterId: string) {
  const url  = `${FRONTEND_URL}/matters/${matterId}`
  const body = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      You have been contacted regarding matter <strong>${matterName}</strong>${d.matter_number ? ` (${d.matter_number})` : ''}.
      Please reply to this email or contact us with the following information so we can process the claim apportionment:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border-collapse:collapse;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;width:45%;">Information Needed</td>
        <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Details</td>
      </tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Carrier Name</td><td style="padding:10px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">Please provide your carrier name</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Dates of Service Responsible For</td><td style="padding:10px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">Start date and end date</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Coverage Period</td><td style="padding:10px 16px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">Policy start and end dates</td></tr>
      <tr><td style="padding:10px 16px;font-size:13px;color:#64748b;">Policy Limits</td><td style="padding:10px 16px;font-size:13px;color:#334155;">Per-occurrence and aggregate limits</td></tr>
    </table>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;line-height:1.6;font-family:sans-serif;">
      Please reply with this information at your earliest convenience. If you have questions, respond directly to this email.
    </p>`
  return {
    subject:  `Coverage Information Request — ${matterName}`,
    html:     layout({ title: 'Coverage Information Request', badgeText: 'Action Required', badgeColor: '#0ea5e9', body }),
    toEmails: d.to_emails as string[],
  }
}

// ── Email sender ──────────────────────────────────────────────────────────────

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

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { type, org_id, matter_id, details = {} } = await req.json()
    if (!type || !org_id)
      return new Response(JSON.stringify({ error: 'type and org_id are required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })

    // party_info_request sends to external emails — skip org recipient lookup
    if (type === 'party_info_request') {
      const matterName = await getMatterName(matter_id)
      const result     = buildPartyInfoRequest(matterName, details, matter_id)
      if (!result.toEmails?.length)
        return new Response(JSON.stringify({ error: 'to_emails is required for party_info_request' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
      await sendEmail(result.toEmails, result.subject, result.html)
      return new Response(JSON.stringify({ sent: result.toEmails.length }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const [recipients, matterName] = await Promise.all([
      getOrgRecipients(org_id),
      getMatterName(matter_id),
    ])
    if (recipients.length === 0)
      return new Response(JSON.stringify({ sent: 0, message: 'No eligible recipients' }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

    let email: { subject: string; html: string }
    switch (type) {
      case 'invoice_parsed':          email = buildInvoiceParsed(matterName, details, matter_id);          break
      case 'apportionment_run':       email = buildApportionmentRun(matterName, details, matter_id);       break
      case 'demand_letter_generated': email = buildDemandLetterGenerated(matterName, details, matter_id);  break
      case 'payment_status_updated':  email = buildPaymentStatusUpdated(matterName, details, matter_id);   break
      default:
        return new Response(JSON.stringify({ error: `Unknown type: ${type}` }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    await sendEmail(recipients, email.subject, email.html)
    return new Response(JSON.stringify({ sent: recipients.length }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('send-notification error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
