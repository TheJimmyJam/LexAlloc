// Supabase Edge Function: check-policy-limits
//
// Scans insurer policy periods with policy limits and fires email alerts
// when cumulative obligated amounts cross 80%, 95%, or 100% of the limit.
//
// POST body options:
//   {}                          → scan all active matters for this org
//   { matter_id }               → scan one matter
//   { policy_period_id }        → check one specific policy period
//   { org_id }                  → required when called without JWT (cron/service)
//
// Returns: { checked: number, alerts_fired: AlertResult[] }
//
// AlertResult shape:
//   { policy_period_id, insurer_name, matter_name, threshold, pct, cumulative_amount, policy_limit }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')           ?? ''
const FROM_EMAIL    = Deno.env.get('FROM_EMAIL')                ?? 'alerts@lexalloc.com'
const FRONTEND_URL  = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const THRESHOLDS = [80, 95, 100] as const
type Threshold = typeof THRESHOLDS[number]

interface AlertResult {
  policy_period_id: string
  insurer_name:     string
  matter_name:      string
  matter_id:        string
  threshold:        Threshold
  pct:              number
  cumulative_amount: number
  policy_limit:     number
  emailed:          boolean
}

// ── Email builder ─────────────────────────────────────────────────────────────

function thresholdMeta(threshold: Threshold) {
  if (threshold >= 100) return { color: '#dc2626', bg: '#fef2f2', label: 'EXHAUSTED',  emoji: '🔴' }
  if (threshold >= 95)  return { color: '#ea580c', bg: '#fff7ed', label: 'NEAR LIMIT', emoji: '🚨' }
  return                       { color: '#d97706', bg: '#fffbeb', label: 'WARNING',     emoji: '⚠️' }
}

function buildAlertEmail({
  orgName, matterName, matterId, insurerName, policyNumber, claimNumber,
  partyName, policyLimit, cumulativeAmount, pct, threshold,
}: {
  orgName: string; matterName: string; matterId: string; insurerName: string
  policyNumber: string; claimNumber: string; partyName: string
  policyLimit: number; cumulativeAmount: number; pct: number; threshold: Threshold
}): { subject: string; html: string } {
  const meta    = thresholdMeta(threshold)
  const fmt     = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  const barPct  = Math.min(pct, 100)
  const barColor = meta.color
  const remaining = Math.max(0, policyLimit - cumulativeAmount)
  const matterUrl = `${FRONTEND_URL}/matters/${matterId}`

  const subject = `${meta.emoji} Policy Limit ${meta.label}: ${insurerName} — ${matterName}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<div style="max-width:580px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">

  <!-- Header -->
  <div style="background:${meta.color};padding:28px 32px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <div style="width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center">
        <span style="color:white;font-size:18px">L</span>
      </div>
      <span style="color:rgba(255,255,255,.9);font-size:13px;font-weight:600">LexAlloc · ${orgName}</span>
    </div>
    <h1 style="color:white;font-size:22px;font-weight:700;margin:0">
      Policy Limit ${meta.label}
    </h1>
    <p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:14px">
      ${pct.toFixed(1)}% of limit consumed across all invoices
    </p>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px">

    <!-- Alert badge -->
    <div style="background:${meta.bg};border:1px solid ${meta.color}33;border-radius:8px;padding:12px 16px;margin-bottom:24px;display:flex;align-items:center;gap:10px">
      <span style="font-size:22px">${meta.emoji}</span>
      <div>
        <p style="margin:0;font-size:14px;font-weight:700;color:${meta.color}">${meta.label}</p>
        <p style="margin:2px 0 0;font-size:13px;color:#64748b">
          ${threshold === 100
            ? 'This policy is fully exhausted. No further obligations should be assigned.'
            : `${100 - threshold}% of limit remaining. Review outstanding obligations.`}
        </p>
      </div>
    </div>

    <!-- Matter + Insurer -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:13px;width:130px">Matter</td>
        <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:13px">${matterName}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9">Insurer</td>
        <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:13px;border-top:1px solid #f1f5f9">${insurerName}</td>
      </tr>
      ${policyNumber ? `<tr>
        <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9">Policy #</td>
        <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:13px;border-top:1px solid #f1f5f9;font-family:monospace">${policyNumber}</td>
      </tr>` : ''}
      ${claimNumber ? `<tr>
        <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9">Claim #</td>
        <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:13px;border-top:1px solid #f1f5f9;font-family:monospace">${claimNumber}</td>
      </tr>` : ''}
      ${partyName ? `<tr>
        <td style="padding:8px 0;color:#64748b;font-size:13px;border-top:1px solid #f1f5f9">Party</td>
        <td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:13px;border-top:1px solid #f1f5f9">${partyName}</td>
      </tr>` : ''}
    </table>

    <!-- Progress bar -->
    <div style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:13px;font-weight:600;color:#1e293b">Limit Exhaustion</span>
        <span style="font-size:14px;font-weight:700;color:${meta.color}">${pct.toFixed(1)}%</span>
      </div>
      <div style="background:#e2e8f0;border-radius:100px;height:10px;overflow:hidden">
        <div style="background:${barColor};height:10px;width:${barPct}%;border-radius:100px;transition:width .3s"></div>
      </div>
    </div>

    <!-- Numbers -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Obligated</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:${meta.color}">${fmt(cumulativeAmount)}</p>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Policy Limit</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#1e293b">${fmt(policyLimit)}</p>
      </div>
      <div style="background:#f8fafc;border-radius:8px;padding:12px;text-align:center">
        <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Remaining</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:${remaining > 0 ? '#059669' : '#dc2626'}">${fmt(remaining)}</p>
      </div>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:8px">
      <a href="${matterUrl}" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
        View Matter in LexAlloc →
      </a>
    </div>

    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">
      This alert was sent because cumulative obligations crossed the ${threshold}% threshold.<br>
      Manage alerts in LexAlloc → Matter → Insurers tab.
    </p>
  </div>
</div>
</body>
</html>`

  return { subject, html }
}

// ── Send email via Resend ─────────────────────────────────────────────────────

async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    console.error('Resend error:', await res.text())
    return false
  }
  return true
}

// ── Check one policy period ───────────────────────────────────────────────────

async function checkPeriod(ippId: string): Promise<AlertResult[]> {
  // 1. Load the policy period + related data
  const { data: ipp, error: ippErr } = await db
    .from('la_insurer_policy_periods')
    .select(`
      id, policy_limit, org_id, matter_id, insurer_id,
      claim_number, claims_rep_email,
      insurers:la_insurers(name, policy_number),
      parties:la_parties(name),
      matters:la_matters(name, created_by)
    `)
    .eq('id', ippId)
    .single()

  if (ippErr || !ipp || !ipp.policy_limit) return []

  // 2. Sum cumulative obligated amount for this policy period
  const { data: iaRows } = await db
    .from('la_insurer_apportionments')
    .select('amount')
    .eq('insurer_policy_period_id', ippId)

  const cumulative = (iaRows ?? []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
  const limit      = Number(ipp.policy_limit)
  if (limit <= 0) return []

  const pct = (cumulative / limit) * 100

  // 3. Check each threshold
  const fired: AlertResult[] = []

  for (const threshold of THRESHOLDS) {
    if (pct < threshold) continue

    // Already alerted at this threshold?
    const { data: existing } = await db
      .from('la_policy_limit_alerts')
      .select('id')
      .eq('policy_period_id', ippId)
      .eq('threshold', threshold)
      .maybeSingle()

    if (existing) continue  // already sent

    // Log the alert first (before email so we don't double-send on retry)
    await db.from('la_policy_limit_alerts').upsert({
      org_id:           ipp.org_id,
      matter_id:        ipp.matter_id,
      insurer_id:       ipp.insurer_id,
      policy_period_id: ippId,
      threshold,
      cumulative_amount: cumulative,
      policy_limit:     limit,
      pct_exhausted:    pct,
    }, { onConflict: 'policy_period_id,threshold' })

    // 4. Build recipient list: org admins + matter creator
    const { data: admins } = await db
      .from('la_profiles')
      .select('email')
      .eq('org_id', ipp.org_id)
      .eq('role', 'admin')

    const recipients = new Set<string>()
    for (const a of admins ?? []) { if (a.email) recipients.add(a.email) }

    // Add matter creator if different
    if ((ipp.matters as any)?.created_by) {
      const { data: creator } = await db
        .from('la_profiles')
        .select('email')
        .eq('id', (ipp.matters as any).created_by)
        .maybeSingle()
      if (creator?.email) recipients.add(creator.email)
    }

    // 5. Get org name
    const { data: org } = await db
      .from('la_organizations')
      .select('name')
      .eq('id', ipp.org_id)
      .maybeSingle()

    // 6. Send email
    let emailed = false
    if (recipients.size > 0) {
      const { subject, html } = buildAlertEmail({
        orgName:          org?.name ?? 'Your Firm',
        matterName:       (ipp.matters as any)?.name ?? 'Matter',
        matterId:         ipp.matter_id,
        insurerName:      (ipp.insurers as any)?.name ?? 'Insurer',
        policyNumber:     (ipp.insurers as any)?.policy_number ?? '',
        claimNumber:      ipp.claim_number ?? '',
        partyName:        (ipp.parties as any)?.name ?? '',
        policyLimit:      limit,
        cumulativeAmount: cumulative,
        pct,
        threshold,
      })
      emailed = await sendEmail([...recipients], subject, html)
    }

    fired.push({
      policy_period_id:  ippId,
      insurer_name:      (ipp.insurers as any)?.name ?? '',
      matter_name:       (ipp.matters as any)?.name ?? '',
      matter_id:         ipp.matter_id,
      threshold,
      pct,
      cumulative_amount: cumulative,
      policy_limit:      limit,
      emailed,
    })
  }

  return fired
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  try {
    const body = req.body ? await req.json().catch(() => ({})) : {}
    const { matter_id, policy_period_id, org_id } = body as any

    let periodIds: string[] = []

    if (policy_period_id) {
      // Single period check
      periodIds = [policy_period_id]
    } else {
      // Batch: find all periods with a policy_limit
      let query = db
        .from('la_insurer_policy_periods')
        .select('id, matter_id, matters:la_matters(status)')
        .not('policy_limit', 'is', null)

      if (matter_id) {
        query = query.eq('matter_id', matter_id)
      } else if (org_id) {
        // Filter to active matters in this org
        const { data: matterIds } = await db
          .from('la_matters')
          .select('id')
          .eq('org_id', org_id)
          .eq('status', 'active')
        const ids = (matterIds ?? []).map((m: any) => m.id)
        if (ids.length === 0) {
          return new Response(JSON.stringify({ checked: 0, alerts_fired: [] }), {
            status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }
        query = query.in('matter_id', ids)
      }

      const { data: periods } = await query
      // Only check active matters
      periodIds = (periods ?? [])
        .filter((p: any) => !matter_id || (p.matters as any)?.status !== 'closed')
        .map((p: any) => p.id)
    }

    // Run checks — sequentially to avoid rate limits
    const allFired: AlertResult[] = []
    for (const id of periodIds) {
      const results = await checkPeriod(id)
      allFired.push(...results)
    }

    return new Response(
      JSON.stringify({ checked: periodIds.length, alerts_fired: allFired }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err: any) {
    console.error('check-policy-limits error:', err)
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
