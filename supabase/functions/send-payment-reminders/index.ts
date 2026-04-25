// Supabase Edge Function: send-payment-reminders
//
// Two modes:
//   AUTO (batch) — POST {} with SERVICE_ROLE_KEY bearer token
//   MANUAL — POST { insurer_apportionment_id } with user JWT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { layout, infoRow, ctaButton, alertBox } from '../_shared/emailTemplate.ts'

const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM     = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL    = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const THRESHOLDS = [30, 60, 90]
const adminDb    = createClient(SUPABASE_URL, SERVICE_KEY)

async function sendEmail(to: string[], cc: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const payload: any = { from: RESEND_FROM, to, subject, html }
  if (cc.length > 0) payload.cc = cc
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message ?? `Resend error ${res.status}`)
  }
}

function buildReminderEmail(opts: {
  daysOutstanding: number
  daysThreshold:   number
  matterName:      string
  matterUrl:       string
  invoiceNumber:   string
  insurerName:     string
  amount:          number
  demandedAt:      string
  isManual:        boolean
}) {
  const { daysOutstanding, daysThreshold, matterName, matterUrl,
          invoiceNumber, insurerName, amount, demandedAt, isManual } = opts

  const tierColors: Record<number, string> = { 30: '#d97706', 60: '#ea580c', 90: '#dc2626', 0: '#7c3aed' }
  const badgeColor = tierColors[daysThreshold] ?? '#64748b'
  const badge      = isManual ? 'Manual Reminder' : `${daysThreshold}-Day Reminder`
  const title      = isManual
    ? `Payment Reminder — ${insurerName}`
    : `${daysThreshold}-Day Payment Reminder — ${insurerName}`

  const calloutBg   = isManual ? '#f5f3ff' : daysThreshold >= 90 ? '#fef2f2' : '#fffbeb'
  const calloutBdr  = isManual ? '#7c3aed' : daysThreshold >= 90 ? '#dc2626' : '#d97706'
  const calloutText = isManual ? '#4c1d95' : daysThreshold >= 90 ? '#7f1d1d' : '#78350f'
  const calloutMsg  = isManual
    ? 'This reminder was sent manually by your matter\'s handling counsel.'
    : daysThreshold >= 90
    ? `<strong>Final Notice:</strong> This obligation is now ${daysOutstanding} days outstanding. Immediate attention is required.`
    : `This is a ${daysThreshold}-day payment reminder. This obligation has been outstanding since ${demandedAt}.`

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  const body = `
    ${alertBox(calloutMsg, calloutBg, calloutBdr, calloutText)}
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      Please be advised that the following payment obligation remains outstanding for matter
      <strong>${matterName}</strong> and requires your prompt attention.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Matter',           matterName)}
      ${infoRow('Invoice #',        invoiceNumber || '—')}
      ${infoRow('Insurer',          insurerName)}
      ${infoRow('Amount Due',       `<strong style="color:#0f172a;font-size:15px;">${fmt(amount)}</strong>`)}
      ${infoRow('Demand Date',      demandedAt)}
      ${infoRow('Days Outstanding', `<strong style="color:${badgeColor};">${daysOutstanding} days</strong>`)}
    </table>
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      Please remit payment or contact us to discuss the status of this obligation.
      If payment has already been sent, please reply with the payment date and reference number.
    </p>
    ${ctaButton('View Matter', matterUrl, badgeColor)}`

  return {
    subject: `[LexAlloc] ${isManual ? '' : `${daysThreshold}-Day `}Payment Reminder — ${insurerName} / ${matterName}`,
    html:    layout({
      title,
      badgeText:  badge,
      badgeColor,
      body,
      footerNote: 'If you have questions, reply to this email or contact the matter\'s handling counsel.',
    }),
  }
}

async function fetchObligation(iaId: string) {
  const { data, error } = await adminDb
    .from('la_insurer_apportionments')
    .select(`
      id, amount, payment_status, demanded_at, org_id,
      insurers:la_insurers(name, contact_email),
      insurer_policy_periods:la_insurer_policy_periods(claims_rep_email, claim_number),
      apportionments:la_apportionments(
        id, matter_id,
        invoice:la_invoices(invoice_number),
        matters:la_matters(name, id)
      )
    `)
    .eq('id', iaId)
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function getOrgAdmins(orgId: string): Promise<string[]> {
  const { data } = await adminDb
    .from('la_profiles')
    .select('email')
    .eq('org_id', orgId)
    .in('role', ['admin', 'user'])
  return (data ?? []).map((r: any) => r.email).filter(Boolean)
}

async function alreadySentForThreshold(iaId: string, threshold: number): Promise<boolean> {
  const { data } = await adminDb
    .from('la_payment_reminders')
    .select('id')
    .eq('insurer_apportionment_id', iaId)
    .eq('days_threshold', threshold)
    .eq('status', 'sent')
    .limit(1)
  return (data ?? []).length > 0
}

async function recordReminder(opts: {
  iaId: string; orgId: string; threshold: number;
  emailTo: string | null; triggeredBy: 'auto' | 'manual';
  status: 'sent' | 'failed'; error?: string
}) {
  await adminDb.from('la_payment_reminders').insert({
    insurer_apportionment_id: opts.iaId,
    org_id:        opts.orgId,
    days_threshold: opts.threshold,
    email_to:      opts.emailTo,
    triggered_by:  opts.triggeredBy,
    status:        opts.status,
    error_message: opts.error ?? null,
  })
}

async function sendReminderForObligation(
  iaId: string,
  triggeredBy: 'auto' | 'manual',
  forceDaysThreshold?: number
) {
  const ia      = await fetchObligation(iaId)
  const orgId   = ia.org_id as string
  const appt    = (ia as any).apportionments
  const matter  = appt?.matters
  const invoice = appt?.invoice

  const insurer     = (ia as any).insurers
  const ipp         = (ia as any).insurer_policy_periods
  const claimsEmail = ipp?.claims_rep_email || insurer?.contact_email || null
  const orgAdmins   = await getOrgAdmins(orgId)

  const matterId    = matter?.id ?? appt?.matter_id ?? ''
  const matterName  = matter?.name ?? 'Unknown Matter'
  const invoiceNum  = invoice?.invoice_number ?? ''
  const insurerName = insurer?.name ?? 'Unknown Insurer'
  const amount      = parseFloat(ia.amount) || 0
  const demandedAt  = ia.demanded_at
    ? new Date(ia.demanded_at as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Unknown'
  const daysOutstanding = ia.demanded_at
    ? Math.floor((Date.now() - new Date(ia.demanded_at as string).getTime()) / 86_400_000)
    : 0

  const matterUrl = `${FRONTEND_URL}/matters/${matterId}/apportionments/${appt?.id ?? ''}`

  let threshold = forceDaysThreshold ?? 0
  if (triggeredBy === 'auto') {
    for (const t of [90, 60, 30]) {
      if (daysOutstanding >= t && !(await alreadySentForThreshold(iaId, t))) {
        threshold = t; break
      }
    }
    if (threshold === 0) return null
  }

  const { subject, html } = buildReminderEmail({
    daysOutstanding, daysThreshold: threshold, matterName, matterUrl,
    invoiceNumber: invoiceNum, insurerName, amount, demandedAt,
    isManual: triggeredBy === 'manual',
  })

  const toList = claimsEmail ? [claimsEmail] : []
  const ccList = orgAdmins.filter(e => e !== claimsEmail)

  if (toList.length === 0 && ccList.length === 0) {
    await recordReminder({ iaId, orgId, threshold, emailTo: null, triggeredBy, status: 'failed', error: 'No recipient email found' })
    return { sent: false, reason: 'no_recipient' }
  }

  const effectiveTo = toList.length > 0 ? toList : ccList
  const effectiveCc = toList.length > 0 ? ccList : []

  try {
    await sendEmail(effectiveTo, effectiveCc, subject, html)
    await recordReminder({ iaId, orgId, threshold, emailTo: effectiveTo[0], triggeredBy, status: 'sent' })
    return { sent: true, to: effectiveTo, threshold }
  } catch (err: any) {
    await recordReminder({ iaId, orgId, threshold, emailTo: effectiveTo[0], triggeredBy, status: 'failed', error: err.message })
    throw err
  }
}

async function runBatchScan() {
  const { data: obligations, error } = await adminDb
    .from('la_insurer_apportionments')
    .select('id, org_id, demanded_at, payment_status')
    .in('payment_status', ['demanded', 'pending'])
    .not('demanded_at', 'is', null)
  if (error) throw new Error(error.message)

  const now = Date.now()
  const results = { sent: 0, skipped: 0, failed: 0 }
  for (const ia of obligations ?? []) {
    const daysOut = Math.floor((now - new Date(ia.demanded_at as string).getTime()) / 86_400_000)
    for (const threshold of THRESHOLDS) {
      if (daysOut < threshold) continue
      if (await alreadySentForThreshold(ia.id as string, threshold)) { results.skipped++; continue }
      try {
        const result = await sendReminderForObligation(ia.id as string, 'auto', threshold)
        if (result?.sent) results.sent++
        else results.skipped++
      } catch { results.failed++ }
    }
  }
  return results
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    })
  }
  try {
    let body: any = {}
    try { body = await req.json() } catch { /* empty body ok for batch */ }

    const { insurer_apportionment_id } = body
    if (insurer_apportionment_id) {
      const result = await sendReminderForObligation(insurer_apportionment_id, 'manual')
      return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    } else {
      const authHeader = req.headers.get('Authorization') ?? ''
      const token      = authHeader.replace('Bearer ', '')
      if (token && token !== SERVICE_KEY && token.length < 100) {
        return new Response(JSON.stringify({ error: 'Batch mode requires service role key' }), { status: 403 })
      }
      const results = await runBatchScan()
      return new Response(JSON.stringify(results), {
        status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
  } catch (err: any) {
    console.error('send-payment-reminders error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
