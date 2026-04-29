// Supabase Edge Function: send-demand-letter
// No external imports — uses native fetch against the Supabase REST API directly.
// This avoids all esm.sh / npm: specifier bundling issues.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ── Supabase REST helpers ─────────────────────────────────────────────────────

const DB_HEADERS = {
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'apikey':        SERVICE_KEY,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
}

async function dbGet(path: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: DB_HEADERS })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`DB GET ${path}: ${res.status} ${txt}`)
  }
  return res.json()
}

async function dbUpdate(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method:  'PATCH',
    headers: DB_HEADERS,
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`DB PATCH ${table}: ${res.status} ${txt}`)
  }
}

async function dbInsert(table: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method:  'POST',
    headers: DB_HEADERS,
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText)
    throw new Error(`DB POST ${table}: ${res.status} ${txt}`)
  }
}

// ── Email template helpers ────────────────────────────────────────────────────

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;
      width:38%;font-family:sans-serif;vertical-align:top;">${label}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;
      font-weight:500;font-family:sans-serif;vertical-align:top;">${value}</td>
  </tr>`
}

function buildHtml(opts: {
  insurerName: string; salutation: string; matterName: string; matterNum: string;
  invoiceNum: string; invoiceDate: string; billingFirm: string; claimNum: string;
  lexallocNum: string; serviceRange: string; amount: string; matterUrl: string;
}): string {
  const { insurerName, salutation, matterName, matterNum, invoiceNum, invoiceDate,
          billingFirm, claimNum, lexallocNum, serviceRange, amount, matterUrl } = opts
  const title = `Formal Demand for Defense Costs — ${insurerName}`
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
          <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-icon.png"
               width="60" height="60" style="display:block;border-radius:50%;" />
        </td>
        <td style="vertical-align:middle;">
          <span style="color:#fff;font-size:22px;font-weight:700;font-family:sans-serif;">LexAlloc</span>
        </td>
      </tr></table></td>
      <td align="right"><span style="background:#2E4057;color:#fff;font-size:11px;font-weight:700;
        padding:4px 12px;border-radius:20px;font-family:sans-serif;">DEMAND LETTER</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#fff;padding:28px 32px 0;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;font-family:sans-serif;">${title}</h1>
  </td></tr>
  <tr><td style="background:#fff;padding:20px 32px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">${salutation}</p>
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:sans-serif;">
      This letter constitutes a formal demand for payment of defense costs incurred in connection
      with the above-referenced matter. Please find the formal demand letter attached to this email.
      A summary of the obligation is provided below for your records.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      ${infoRow('Matter', matterName + matterNum)}
      ${infoRow('Invoice #', invoiceNum)}
      ${infoRow('Invoice Date', invoiceDate)}
      ${infoRow('Billing Firm', billingFirm)}
      ${claimNum   ? infoRow('Claim No.', claimNum) : ''}
      ${lexallocNum ? infoRow('LexAlloc Invoice No.', lexallocNum) : ''}
      ${infoRow('Service Period', serviceRange)}
      ${infoRow('Amount Due', `<strong style="color:#0f172a;font-size:16px;">${amount}</strong>`)}
    </table>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;font-family:sans-serif;">
      Payment of <strong>${amount}</strong> is requested within thirty (30) days of the date of
      this letter. Please reference the matter name and invoice number on all correspondence and
      remittances to ensure proper application of payment.
    </p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.6;font-family:sans-serif;">
      If you have any questions regarding this demand or the underlying calculation methodology,
      please do not hesitate to contact the issuing law firm.
    </p>
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="background:#2E4057;border-radius:8px;">
        <a href="${matterUrl}" style="display:inline-block;padding:14px 28px;color:#fff;
          font-weight:600;font-size:14px;text-decoration:none;font-family:sans-serif;">
          View Matter &rarr;</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;
    border-radius:0 0 14px 14px;padding:20px 32px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;font-family:sans-serif;">
      Legal Invoice Apportionment Platform &mdash;
      <a href="https://lexalloc.netlify.app" style="color:#94a3b8;">lexalloc.netlify.app</a><br>
      If you have questions regarding this demand, please contact the issuing law firm directly.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return d
  return `${String(dt.getUTCMonth() + 1).padStart(2,'0')}/${String(dt.getUTCDate()).padStart(2,'0')}/${dt.getUTCFullYear()}`
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey' }

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const {
      insurer_apportionment_id,
      attachment_base64,
      attachment_filename,
      claims_rep_email:        passedEmail,
      claims_rep_name:         passedRepName,
      insurer_name:            passedInsurerName,
      lexalloc_invoice_number: lexallocNum,
      email_html:              passedEmailHtml,
    } = body

    if (!insurer_apportionment_id) {
      return new Response(JSON.stringify({ error: 'insurer_apportionment_id required' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ── Fetch insurer apportionment with joins ────────────────────────────────
    const select = [
      'id,amount,payment_status,insurer_id,insurer_policy_period_id',
      'insurers:la_insurers(name,contact_email)',
      'insurer_policy_periods:la_insurer_policy_periods(claims_rep_name,claims_rep_email,claim_number,billing_address)',
      'apportionment:la_apportionments(id,matter_id,invoice:la_invoices(invoice_number,invoice_date,billing_firm,total_amount,service_start,service_end),matters:la_matters(name,matter_number,id,org_id))',
    ].join(',')

    const iaRows = await dbGet(`la_insurer_apportionments?id=eq.${insurer_apportionment_id}&select=${encodeURIComponent(select)}&limit=1`)
    if (!iaRows || !iaRows.length) throw new Error('Insurer apportionment not found')
    const ia = iaRows[0]

    const insurer  = ia.insurers
    const ippFk    = ia.insurer_policy_periods
    const appt     = ia.apportionment
    const matter   = appt?.matters
    const invoice  = appt?.invoice
    const orgId    = matter?.org_id as string
    const amount   = parseFloat(ia.amount) || 0

    // ── Resolve claims rep contact ────────────────────────────────────────────
    let claimsEmail: string | null = passedEmail || ippFk?.claims_rep_email || null
    let claimsName:  string | null = passedRepName || ippFk?.claims_rep_name || null
    let claimNumber: string | null = ippFk?.claim_number || null

    // Fallback: query by insurer_id + matter_id if FK was null
    if (!claimsEmail && ia.insurer_id && appt?.matter_id) {
      const fallback = await dbGet(
        `la_insurer_policy_periods?insurer_id=eq.${ia.insurer_id}&matter_id=eq.${appt.matter_id}&select=claims_rep_email,claims_rep_name,claim_number&limit=1`
      ).catch(() => [])
      if (fallback?.length) {
        claimsEmail = claimsEmail || fallback[0].claims_rep_email || null
        claimsName  = claimsName  || fallback[0].claims_rep_name  || null
        claimNumber = claimNumber || fallback[0].claim_number      || null
      }
    }

    if (!claimsEmail) claimsEmail = insurer?.contact_email || null

    // ── Org admins for CC ─────────────────────────────────────────────────────
    const admins = await dbGet(
      `la_profiles?org_id=eq.${orgId}&role=in.(admin,user)&notifications_muted=eq.false&select=email`
    ).catch(() => [])
    const orgAdminEmails: string[] = (admins || []).map((r: any) => r.email).filter(Boolean)

    // ── Build email ───────────────────────────────────────────────────────────
    const insurerName  = passedInsurerName || insurer?.name || 'Unknown Insurer'
    const matterName   = matter?.name ?? 'Unknown Matter'
    const matterNum    = matter?.matter_number ? ` (Matter No. ${matter.matter_number})` : ''
    const invoiceNum   = invoice?.invoice_number ?? '—'
    const matterId     = matter?.id ?? appt?.matter_id ?? ''
    const apptId       = appt?.id ?? ''
    const matterUrl    = `${FRONTEND_URL}/matters/${matterId}/apportionments/${apptId}`

    const serviceStart = fmtDate(invoice?.service_start)
    const serviceEnd   = invoice?.service_end && invoice.service_end !== invoice.service_start
      ? ` through ${fmtDate(invoice.service_end)}` : ''
    const serviceRange = invoice?.service_start ? serviceStart + serviceEnd : '—'

    const html = passedEmailHtml ?? buildHtml({
      insurerName,
      salutation:  claimsName ? `Dear ${claimsName}:` : 'Dear Sir or Madam:',
      matterName,  matterNum,
      invoiceNum,
      invoiceDate: fmtDate(invoice?.invoice_date),
      billingFirm: invoice?.billing_firm ?? '—',
      claimNum:    claimNumber ?? '',
      lexallocNum: lexallocNum ?? '',
      serviceRange,
      amount:      fmt(amount),
      matterUrl,
    })

    const subject = `Formal Demand for Defense Costs — ${insurerName} / ${matterName} / Invoice ${invoiceNum}`

    const attachments = attachment_base64 && attachment_filename
      ? [{ filename: attachment_filename, content: attachment_base64 }]
      : []

    // ── Send email ────────────────────────────────────────────────────────────
    const toList      = claimsEmail ? [claimsEmail] : []
    const ccList      = orgAdminEmails.filter((e: string) => e !== claimsEmail)
    const effectiveTo = toList.length > 0 ? toList : ccList
    const effectiveCc = toList.length > 0 ? ccList  : []

    let sent   = false
    let sentTo: string | null = null

    if (effectiveTo.length > 0) {
      if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
      const payload: Record<string, unknown> = { from: RESEND_FROM, to: effectiveTo, subject, html }
      if (effectiveCc.length > 0)  payload.cc          = effectiveCc
      if (attachments.length > 0)  payload.attachments = attachments

      const resendRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!resendRes.ok) {
        const err = await resendRes.json().catch(() => ({}))
        throw new Error((err as any).message ?? `Resend HTTP ${resendRes.status}`)
      }
      sent   = true
      sentTo = effectiveTo[0]
    }

    // ── Mark as demanded + log ────────────────────────────────────────────────
    const now = new Date().toISOString()
    await dbUpdate('la_insurer_apportionments', `id=eq.${insurer_apportionment_id}`,
      { payment_status: 'demanded', demanded_at: now })

    await dbInsert('la_payment_reminders', {
      insurer_apportionment_id,
      org_id:         orgId,
      days_threshold: 0,
      email_to:       sentTo,
      triggered_by:   'manual',
      status:         sent ? 'sent' : 'failed',
      error_message:  sent ? null : 'No recipient email found',
    })

    return new Response(
      JSON.stringify({ sent, to: effectiveTo, claimsEmail, resolvedVia: passedEmail ? 'frontend' : ippFk?.claims_rep_email ? 'fk_join' : 'fallback_query' }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('send-demand-letter error:', err?.message ?? err)
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
