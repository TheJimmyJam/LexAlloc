// Supabase Edge Function: accounting-oauth-callback
//
// OAuth 2.0 redirect handler for QuickBooks Online and Clio.
// Both providers redirect here after user authorization.
//
// Flow:
//   1. Provider redirects → ?code=xxx&state={provider,org_id,return_url}&realmId=yyy (QBO only)
//   2. Exchange code for access + refresh tokens
//   3. Upsert row in la_accounting_connections
//   4. Redirect browser to FRONTEND_URL/admin?tab=integrations&connected={provider}
//
// Required Supabase secrets:
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, QBO_ENVIRONMENT
//   CLIO_CLIENT_ID, CLIO_CLIENT_SECRET, CLIO_REDIRECT_URI
//   FRONTEND_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FRONTEND_URL  = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.com'

const QBO_CLIENT_ID     = Deno.env.get('QBO_CLIENT_ID')     ?? ''
const QBO_CLIENT_SECRET = Deno.env.get('QBO_CLIENT_SECRET') ?? ''
const QBO_REDIRECT_URI  = Deno.env.get('QBO_REDIRECT_URI')  ?? `${SUPABASE_URL}/functions/v1/accounting-oauth-callback`
const QBO_ENVIRONMENT   = Deno.env.get('QBO_ENVIRONMENT')   ?? 'sandbox'

const CLIO_CLIENT_ID     = Deno.env.get('CLIO_CLIENT_ID')     ?? ''
const CLIO_CLIENT_SECRET = Deno.env.get('CLIO_CLIENT_SECRET') ?? ''
const CLIO_REDIRECT_URI  = Deno.env.get('CLIO_REDIRECT_URI')  ?? `${SUPABASE_URL}/functions/v1/accounting-oauth-callback`

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Token exchange ────────────────────────────────────────────────────────────

async function exchangeQBO(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const credentials = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      Accept:          'application/json',
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: QBO_REDIRECT_URI,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`QBO token exchange failed: ${err}`)
  }
  return res.json()
}

async function exchangeClio(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch('https://app.clio.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     CLIO_CLIENT_ID,
      client_secret: CLIO_CLIENT_SECRET,
      redirect_uri:  CLIO_REDIRECT_URI,
      code,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Clio token exchange failed: ${err}`)
  }
  return res.json()
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const error  = url.searchParams.get('error')
  const rawState = url.searchParams.get('state') ?? ''
  const realmId  = url.searchParams.get('realmId') // QBO only

  const redirectError = (msg: string, provider = 'unknown') =>
    Response.redirect(`${FRONTEND_URL}/admin?tab=integrations&error=${encodeURIComponent(msg)}&provider=${provider}`, 302)

  if (error) {
    return redirectError(error)
  }

  if (!code) {
    return redirectError('No authorization code received')
  }

  // Decode state: base64 JSON { provider, org_id }
  let state: { provider: string; org_id: string }
  try {
    state = JSON.parse(atob(rawState))
  } catch {
    return redirectError('Invalid state parameter')
  }

  const { provider, org_id } = state
  if (!provider || !org_id) {
    return redirectError('Missing provider or org in state')
  }

  try {
    let tokens: { access_token: string; refresh_token: string; expires_in: number }
    let resolvedRealmId = realmId ?? null

    if (provider === 'quickbooks') {
      tokens = await exchangeQBO(code)
      if (!resolvedRealmId) return redirectError('No realmId from QuickBooks', provider)
    } else if (provider === 'clio') {
      tokens = await exchangeClio(code)
      // Fetch Clio account ID from /api/v4/users/who_am_i
      try {
        const me = await fetch('https://app.clio.com/api/v4/users/who_am_i.json', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        const meData = await me.json()
        resolvedRealmId = String(meData?.data?.account_id ?? meData?.data?.id ?? '')
      } catch { /* non-fatal */ }
    } else {
      return redirectError(`Unknown provider: ${provider}`)
    }

    const tokenExpiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()

    // Upsert connection
    const { error: dbErr } = await db
      .from('la_accounting_connections')
      .upsert({
        org_id,
        provider,
        realm_id:      resolvedRealmId,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry:  tokenExpiry,
        is_active:     true,
        connected_at:  new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })

    if (dbErr) return redirectError(dbErr.message, provider)

    return Response.redirect(
      `${FRONTEND_URL}/admin?tab=integrations&connected=${provider}`,
      302
    )
  } catch (err: any) {
    console.error('OAuth callback error:', err)
    return redirectError(err.message ?? 'OAuth failed', provider)
  }
})
