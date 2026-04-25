// Supabase Edge Function: push-accounting-payment
//
// Pushes a paid insurer obligation to QuickBooks Online (as a Deposit)
// or Clio (as an ActivityDescription), then logs the result.
//
// POST body: { insurer_apportionment_id, provider }
//   provider: 'quickbooks' | 'clio'
//
// Required Supabase secrets:
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_ENVIRONMENT
//   CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, CLIO_REDIRECT_URI
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const QBO_CLIENT_ID     = Deno.env.get('QBO_CLIENT_ID')     ?? ''
const QBO_CLIENT_SECRET = Deno.env.get('QBO_CLIENT_SECRET') ?? ''
const QBO_REDIRECT_URI  = Deno.env.get('QBO_REDIRECT_URI')  ?? ''
const QBO_ENVIRONMENT   = Deno.env.get('QBO_ENVIRONMENT')   ?? 'sandbox'

const CLIO_CLIENT_ID     = Deno.env.get('CLIO_CLIENT_ID')     ?? ''
const CLIO_CLIENT_SECRET = Deno.env.get('CLIO_CLIENT_SECRET') ?? ''
const CLIO_REDIRECT_URI  = Deno.env.get('CLIO_REDIRECT_URI')  ?? ''

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const QBO_BASE = QBO_ENVIRONMENT === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshQBOToken(conn: any) {
  const credentials = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization:  `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept:         'application/json',
    },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: conn.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`QBO refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function refreshClioToken(conn: any) {
  const res = await fetch('https://app.clio.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     CLIO_CLIENT_ID,
      client_secret: CLIO_CLIENT_SECRET,
      redirect_uri:  CLIO_REDIRECT_URI,
      refresh_token: conn.refresh_token,
    }),
  })
  if (!res.ok) throw new Error(`Clio refresh failed: ${await res.text()}`)
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>
}

async function ensureFreshToken(conn: any, provider: string): Promise<{ conn: any; token: string }> {
  const now = Date.now()
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0
  if (expiry - now > 60_000) {
    return { conn, token: conn.access_token }
  }

  // Refresh
  const tokens = provider === 'quickbooks'
    ? await refreshQBOToken(conn)
    : await refreshClioToken(conn)

  const tokenExpiry = new Date(now + (tokens.expires_in - 60) * 1000).toISOString()
  const updated = {
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry:  tokenExpiry,
  }
  await db.from('la_accounting_connections')
    .update(updated)
    .eq('id', conn.id)

  return { conn: { ...conn, ...updated }, token: tokens.access_token }
}

// ── Obligation loader ─────────────────────────────────────────────────────────

async function loadObligation(iaId: string) {
  const { data, error } = await db
    .from('la_insurer_apportionments')
    .select(`
      id, amount, amount_paid, payment_status, payment_date, org_id,
      insurers:la_insurers(name),
      insurer_policy_periods:la_insurer_policy_periods(claim_number),
      apportionments:la_apportionments(
        matter_id,
        invoice:la_invoices(invoice_number, invoice_date),
        matters:la_matters(name, matter_number)
      )
    `)
    .eq('id', iaId)
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── QuickBooks push (Deposit) ─────────────────────────────────────────────────
//
// Creates a Deposit transaction to record money received from the insurer.
// Requires la_accounting_connections.settings:
//   { "deposit_account_id": "35", "income_account_id": "79" }
// Use QBO Chart of Accounts IDs from your company's COA.
// Defaults: deposit_account_id="1" (Checking), income_account_id="79" (Other Income)

async function pushToQBO(token: string, conn: any, ia: any): Promise<string> {
  const appt         = (ia as any).apportionments
  const matter       = appt?.matters
  const invoice      = appt?.invoice
  const ipp          = (ia as any).insurer_policy_periods
  const insurerName  = (ia as any).insurers?.name ?? 'Insurer'
  const amount       = parseFloat(ia.amount_paid ?? ia.amount) || 0
  const txnDate      = ia.payment_date
    ? ia.payment_date
    : new Date().toISOString().split('T')[0]
  const memo = [
    'LexAlloc',
    matter?.name,
    invoice?.invoice_number ? `Inv #${invoice.invoice_number}` : null,
    insurerName,
    ipp?.claim_number ? `Claim: ${ipp.claim_number}` : null,
  ].filter(Boolean).join(' | ')

  const settings          = conn.settings ?? {}
  const depositAccountId  = settings.deposit_account_id  ?? '1'
  const incomeAccountId   = settings.income_account_id   ?? '79'

  const body = {
    TxnDate:            txnDate,
    PrivateNote:        memo,
    DepositToAccountRef: { value: String(depositAccountId) },
    Line: [{
      Amount:     amount,
      DetailType: 'DepositLineDetail',
      DepositLineDetail: {
        AccountRef: { value: String(incomeAccountId) },
      },
    }],
  }

  const realmId = conn.realm_id
  const res = await fetch(
    `${QBO_BASE}/v3/company/${realmId}/deposit?minorversion=65`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify({ Deposit: body }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.Fault?.Error?.[0]?.Message ?? `QBO error ${res.status}`
    throw new Error(msg)
  }

  const data = await res.json()
  return String(data?.Deposit?.Id ?? 'unknown')
}

// ── Clio push (ActivityDescription) ──────────────────────────────────────────
//
// Creates an activity entry in Clio under the specified matter.
// Requires la_accounting_connections.settings:
//   { "clio_matter_id": "123456" }  — optional; creates global note if absent.

async function pushToClio(token: string, conn: any, ia: any): Promise<string> {
  const appt        = (ia as any).apportionments
  const matter      = appt?.matters
  const invoice     = (ia as any).apportionments?.invoice
  const insurerName = (ia as any).insurers?.name ?? 'Insurer'
  const amount      = parseFloat(ia.amount_paid ?? ia.amount) || 0
  const txnDate     = ia.payment_date ?? new Date().toISOString().split('T')[0]

  const settings     = conn.settings ?? {}
  const clioMatterId = settings.clio_matter_id ?? null

  const note = [
    `Received payment: $${amount.toFixed(2)}`,
    matter?.name ? `Matter: ${matter.name}` : null,
    invoice?.invoice_number ? `Invoice: ${invoice.invoice_number}` : null,
    `Insurer: ${insurerName}`,
    `Date: ${txnDate}`,
    '(via LexAlloc apportionment)',
  ].filter(Boolean).join('\n')

  const payload: any = {
    data: {
      type:        'Note',
      subject:     `Payment received — ${insurerName}`,
      detail:      note,
      date:        txnDate,
    }
  }

  if (clioMatterId) {
    payload.data.matter = { id: Number(clioMatterId) }
  }

  const res = await fetch('https://app.clio.com/api/v4/notes.json', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error?.message ?? `Clio error ${res.status}`
    throw new Error(msg)
  }

  const data = await res.json()
  return String(data?.data?.id ?? 'unknown')
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  try {
    const { insurer_apportionment_id, provider } = await req.json()

    if (!insurer_apportionment_id || !provider) {
      return new Response(
        JSON.stringify({ error: 'insurer_apportionment_id and provider are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Load obligation
    const ia = await loadObligation(insurer_apportionment_id)
    const orgId = ia.org_id as string

    // Load connection
    const { data: conn, error: connErr } = await db
      .from('la_accounting_connections')
      .select('*')
      .eq('org_id', orgId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single()

    if (connErr || !conn) {
      return new Response(
        JSON.stringify({ error: `No active ${provider} connection for this org` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Ensure fresh token
    const { conn: freshConn, token } = await ensureFreshToken(conn, provider)

    // Push to provider
    let externalId: string
    if (provider === 'quickbooks') {
      externalId = await pushToQBO(token, freshConn, ia)
    } else if (provider === 'clio') {
      externalId = await pushToClio(token, freshConn, ia)
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown provider: ${provider}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Log success
    await db.from('la_accounting_pushes').insert({
      insurer_apportionment_id,
      org_id:      orgId,
      provider,
      external_id: externalId,
      amount:      parseFloat((ia as any).amount_paid ?? (ia as any).amount) || 0,
      status:      'success',
    })

    return new Response(
      JSON.stringify({ success: true, external_id: externalId }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err: any) {
    console.error('push-accounting-payment error:', err)

    // Attempt to log failure (best-effort)
    try {
      const body = await req.clone().json().catch(() => ({}))
      const { insurer_apportionment_id, provider } = body as any
      if (insurer_apportionment_id && provider) {
        const ia = await loadObligation(insurer_apportionment_id).catch(() => null)
        if (ia) {
          await db.from('la_accounting_pushes').insert({
            insurer_apportionment_id,
            org_id:        (ia as any).org_id,
            provider,
            status:        'failed',
            error_message: err.message,
          })
        }
      }
    } catch { /* non-fatal */ }

    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
