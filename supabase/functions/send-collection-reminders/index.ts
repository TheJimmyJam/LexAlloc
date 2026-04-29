// Supabase Edge Function: send-collection-reminders
//
// Runs daily (via pg_cron or Cowork scheduled task) and sends collection
// emails to ALL parties with outstanding balances on this schedule:
//
//   • 1st of the month  → monthly collection letter  (everyone with a balance)
//   • 60–89 days out    → bi-weekly reminder          (every 14 days)
//   • 90+ days out      → weekly reminder             (every 7 days)
//
// "Days outstanding" = days since demanded_at if set, else days since
// the apportionment was calculated (so unpaid obligations are always tracked).
//
// Each send is recorded in la_payment_reminders with schedule_type so the
// correct cadence can be enforced without double-sending.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { layout, infoRow, ctaButton, alertBox } from '../_shared/emailTemplate.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

async function sendEmail(
  to: string[],
  cc: string[],
  subject: string,
  html: string,
) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')
  const payload: Record<string, unknown> = { from: RESEND_FROM, to, subject, html }
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

// ── Last-send queries ─────────────────────────────────────────────────────────

async function daysSinceLastSend(iaId: string, scheduleType: string): Promise<number | null> {
  const { data } = await adminDb
    .from('la_payment_reminders')
    .select('sent_at')
    .eq('insurer_apportionment_id', iaId)
    .eq('schedule_type', scheduleType)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
  if (!data?.length) return null
  return daysSince((data[0] as any).sent_at)
}

async function daysSinceAnySend(iaId: string): Promise<number | null> {
  const { data } = await adminDb
    .from('la_payment_reminders')
    .select('sent_at')
    .eq('insurer_apportionment_id', iaId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
  if (!data?.length) return null
  return daysSince((data[0] as any).sent_at)
}

async function alreadySentToday(iaId: string): Promise<boolean> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data } = await adminDb
    .from('la_payment_reminders')
    .select('id')
    .eq('insurer_apportionment_id', iaId)
    .eq('status', 'sent')
    .gte('sent_at', todayStart.toISOString())
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ── Email builder ─────────────────────────────────────────────────────────────

function buildCollectionEmail(opts: {
  scheduleType: 'monthly' | 'biweekly' | 'weekly'
  daysOutstanding: number
  insurerName: string
  claimsRepName: string | null
  matterName: string
  matterNum: string
  invoiceNumber: string
  invoiceDate: string | null
  serviceStart: string | null
  serviceEnd: string | null
  amount: number
  claimNumber: string | null
  matterUrl: string
}) {
  const {
    scheduleType, daysOutstanding, insurerName, claimsRepName,
    matterName, matterNum, invoiceNumber, invoiceDate,
    serviceStart, serviceEnd, amount, claimNumber, matterUrl,
  } = opts

  const salutation = claimsRepName ? `Dear ${claimsRepName}:` : 'Dear Sir or Madam:'

  const serviceRange = serviceStart
    ? fmtDate(serviceStart) + (serviceEnd && serviceEnd !== serviceStart ? ` through ${fmtDate(serviceEnd)}` : '')
    : '—'

  const urgencyConfig = {
    monthly:  { badge: 'Collection Notice',  badgeColor: '#2E4057', alertBg: '#f0f4f8', alertBdr: '#2E4057', alertText: '#1e3a5f' },
    biweekly: { badge: 'Payment Reminder',   badgeColor: '#d97706', alertBg: '#fffbeb', alertBdr: '#d97706', alertText: '#78350f' },
    weekly:   { badge: 'Urgent — Past Due',  badgeColor: '#dc2626', alertBg: '#fef2f2', alertBdr: '#dc2626', alertText: '#7f1d1d' },
  }[scheduleType]

  const daysLabel = daysOutstanding > 0 ? `${daysOutstanding} days` : 'recently invoiced'

  const alertMsg = {
    monthly:  `This is your monthly collection notice for the outstanding balance referenced below.`,
    biweekly: `<strong>60+ Days Outstanding:</strong> This obligation has remained unpaid for ${daysLabel}. Please remit payment at your earliest convenience.`,
    weekly:   `<strong>90+ Days Outstanding — Immediate Action Required:</strong> This balance has been outstanding for ${daysLabel}. Continued non-payment may result in escalated collection action.`,
  }[scheduleType]

  const emailBody = `
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      ${salutation}
    </p>
    ${alertBox(alertMsg, urgencyConfig.alertBg, urgencyConfig.alertBdr, urgencyConfig.alertText)}
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      Please be advised that the following balance remains outstanding and requires your prompt attention.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:20px;">
      ${infoRow('Matter',          matterName + matterNum)}
      ${invoiceNumber ? infoRow('Invoice #',   invoiceNumber) : ''}
      ${invoiceDate   ? infoRow('Invoice Date', fmtDate(invoiceDate)) : ''}
      ${claimNumber   ? infoRow('Claim No.',    claimNumber) : ''}
      ${serviceStart  ? infoRow('Service Period', serviceRange) : ''}
      ${infoRow('Days Outstanding', `<strong style="color:${daysOutstanding >= 90 ? '#dc2626' : daysOutstanding >= 60 ? '#d97706' : '#0f172a'};">${daysLabel}</strong>`)}
      ${infoRow('Balance Due',      `<strong style="color:#0f172a;font-size:16px;">${fmt(amount)}</strong>`)}
    </table>
    <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      Payment of <strong>${fmt(amount)}</strong> should be remitted within thirty (30) days of the original demand.
      Please reference the matter name and invoice number on all payments and correspondence.
    </p>
    <p style="margin:0 0 0;font-size:13px;color:#64748b;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
      If payment has already been sent, please reply with the payment date and reference number so we may update our records.
      If you have questions regarding this balance, please contact the matter's handling counsel.
    </p>
    ${ctaButton('View Matter', matterUrl, urgencyConfig.badgeColor)}`

  const subjectPrefix = {
    monthly:  'Collection Notice',
    biweekly: `Payment Reminder — ${daysOutstanding} Days Outstanding`,
    weekly:   `URGENT: ${daysOutstanding} Days Outstanding`,
  }[scheduleType]

  return {
    subject: `[LexAlloc] ${subjectPrefix} — ${insurerName} / ${matterName} / Invoice ${invoiceNumber || '—'}`,
    html: layout({
      title:      `${urgencyConfig.badge} — ${insurerName}`,
      badgeText:  urgencyConfig.badge,
      badgeColor: urgencyConfig.badgeColor,
      body:       emailBody,
      footerNote: 'If you have questions regarding this balance, please contact the issuing law firm directly.',
    }),
  }
}

// ── Record send ───────────────────────────────────────────────────────────────

async function recordSend(opts: {
  iaId: string
  orgId: string
  scheduleType: string
  emailTo: string | null
  status: 'sent' | 'failed'
  error?: string
}) {
  await adminDb.from('la_payment_reminders').insert({
    insurer_apportionment_id: opts.iaId,
    org_id:        opts.orgId,
    days_threshold: 0,
    schedule_type:  opts.scheduleType,
    email_to:       opts.emailTo,
    triggered_by:   'auto',
    status:         opts.status,
    error_message:  opts.error ?? null,
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    })
  }

  try {
    const today          = new Date()
    const isFirstOfMonth = today.getDate() === 1

    // Fetch ALL obligations that haven't been fully paid or written off
    const { data: obligations, error: obErr } = await adminDb
      .from('la_insurer_apportionments')
      .select(`
        id, amount, payment_status, demanded_at, org_id,
        insurers:la_insurers(name, contact_email),
        insurer_policy_periods:la_insurer_policy_periods(
          claims_rep_name, claims_rep_email, claim_number
        ),
        apportionment:la_apportionments(
          id, matter_id, calculated_at,
          invoice:la_invoices(invoice_number, invoice_date, total_amount, service_start, service_end),
          matters:la_matters(name, matter_number, id)
        )
      `)
      .not('payment_status', 'in', '("paid","written_off")')
      .gt('amount', 0)

    if (obErr) throw new Error(obErr.message)

    const results = { monthly: 0, biweekly: 0, weekly: 0, skipped: 0, failed: 0 }

    for (const ia of (obligations ?? []) as any[]) {
      // Skip if already sent something today (prevent duplicate sends from retries)
      if (await alreadySentToday(ia.id)) { results.skipped++; continue }

      const insurer  = ia.insurers
      const ipp      = ia.insurer_policy_periods
      const appt     = ia.apportionment
      const matter   = appt?.matters
      const invoice  = appt?.invoice
      const orgId    = ia.org_id as string
      const amount   = parseFloat(ia.amount) || 0

      // Days outstanding: since demand if sent, else since apportionment was calculated
      const startDate    = ia.demanded_at ?? appt?.calculated_at
      const daysOut      = startDate ? daysSince(startDate) : 0

      const claimsEmail  = ipp?.claims_rep_email || insurer?.contact_email || null
      const insurerName  = insurer?.name          ?? 'Unknown Insurer'
      const matterName   = matter?.name           ?? 'Unknown Matter'
      const matterNum    = matter?.matter_number   ? ` (Matter No. ${matter.matter_number})` : ''
      const matterId     = matter?.id              ?? appt?.matter_id ?? ''
      const apptId       = appt?.id               ?? ''
      const matterUrl    = `${FRONTEND_URL}/matters/${matterId}/apportionments/${apptId}`

      // Org admins for CC
      const { data: admins } = await adminDb
        .from('la_profiles')
        .select('email')
        .eq('org_id', orgId)
        .in('role', ['admin', 'user'])
      const adminEmails = ((admins ?? []) as any[]).map((r: any) => r.email).filter(Boolean)

      // ── Determine schedule ────────────────────────────────────────────────
      let scheduleType: 'monthly' | 'biweekly' | 'weekly' | null = null

      if (daysOut >= 90) {
        // Weekly: send if no reminder in the last 7 days
        const sinceAny = await daysSinceAnySend(ia.id)
        if (sinceAny === null || sinceAny >= 7) scheduleType = 'weekly'

      } else if (daysOut >= 60) {
        // Bi-weekly: send if no reminder in the last 14 days
        const sinceAny = await daysSinceAnySend(ia.id)
        if (sinceAny === null || sinceAny >= 14) scheduleType = 'biweekly'

      } else if (isFirstOfMonth) {
        // Monthly: send on the 1st if no monthly sent this calendar month
        const sinceMonthly = await daysSinceLastSend(ia.id, 'monthly')
        if (sinceMonthly === null || sinceMonthly >= 25) scheduleType = 'monthly'
      }

      if (!scheduleType) { results.skipped++; continue }

      // ── Build + send email ────────────────────────────────────────────────
      const { subject, html } = buildCollectionEmail({
        scheduleType,
        daysOutstanding: daysOut,
        insurerName,
        claimsRepName:  ipp?.claims_rep_name  ?? null,
        matterName,
        matterNum,
        invoiceNumber:  invoice?.invoice_number ?? '',
        invoiceDate:    invoice?.invoice_date   ?? null,
        serviceStart:   invoice?.service_start  ?? null,
        serviceEnd:     invoice?.service_end    ?? null,
        amount,
        claimNumber:    ipp?.claim_number ?? null,
        matterUrl,
      })

      const toList      = claimsEmail ? [claimsEmail] : []
      const ccList      = adminEmails.filter((e: string) => e !== claimsEmail)
      const effectiveTo = toList.length > 0 ? toList : ccList
      const effectiveCc = toList.length > 0 ? ccList : []

      if (effectiveTo.length === 0) {
        // No recipient — log the skip but don't count as failure
        await recordSend({ iaId: ia.id, orgId, scheduleType, emailTo: null, status: 'failed', error: 'No recipient email on file' })
        results.skipped++
        continue
      }

      try {
        await sendEmail(effectiveTo, effectiveCc, subject, html)
        await recordSend({ iaId: ia.id, orgId, scheduleType, emailTo: effectiveTo[0], status: 'sent' })
        results[scheduleType]++
      } catch (err: any) {
        await recordSend({ iaId: ia.id, orgId, scheduleType, emailTo: effectiveTo[0], status: 'failed', error: err.message })
        results.failed++
      }
    }

    console.log('Collection reminders sent:', results)
    return new Response(JSON.stringify({ ok: true, ...results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err: any) {
    console.error('send-collection-reminders error:', err)
    return new Response(JSON.stringify({ error: err.message ?? 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
