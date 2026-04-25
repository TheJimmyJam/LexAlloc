// Supabase Edge Function: import-pm-matters
//
// Fetches a normalized matter list from Clio or FileVine for
// display in the LexAlloc matter import UI.
//
// POST body: { provider: 'clio' | 'filevine', org_id, search? }
//
// Returns: { matters: ImportedMatter[] }
//
// ImportedMatter shape:
//   { external_id, name, matter_number, status, source, parties[] }
//
// Clio: reuses la_accounting_connections OAuth token (auto-refreshes)
// FileVine: uses la_pm_connections API key credentials

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY        = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const CLIO_CLIENT_ID     = Deno.env.get('CLIO_CLIENT_ID')            ?? ''
const CLIO_CLIENT_SECRET = Deno.env.get('CLIO_CLIENT_SECRET')        ?? ''
const CLIO_REDIRECT_URI  = Deno.env.get('CLIO_REDIRECT_URI')         ?? ''

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Types ─────────────────────────────────────────────────────────────────────

interface ImportedMatter {
  external_id:   string
  name:          string
  matter_number: string
  status:        string
  source:        'clio' | 'filevine'
  parties:       { name: string; role: string }[]
}

// ── Clio token refresh ────────────────────────────────────────────────────────

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
  const tokens: any = await res.json()
  const tokenExpiry = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()
  await db.from('la_accounting_connections').update({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expiry:  tokenExpiry,
  }).eq('id', conn.id)
  return tokens.access_token as string
}

async function getClioToken(orgId: string): Promise<string> {
  const { data: conn, error } = await db
    .from('la_accounting_connections')
    .select('*')
    .eq('org_id', orgId)
    .eq('provider', 'clio')
    .eq('is_active', true)
    .single()
  if (error || !conn) throw new Error('No active Clio connection. Connect Clio in Admin → Integrations first.')

  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0
  if (expiry - Date.now() > 60_000) return conn.access_token as string
  return refreshClioToken(conn)
}

// ── Clio fetcher ──────────────────────────────────────────────────────────────

async function fetchClioMatters(orgId: string, search: string): Promise<ImportedMatter[]> {
  const token = await getClioToken(orgId)

  // Fetch matters (up to 200)
  const fields = 'id,display_number,description,status,clients{id,name,type}'
  const params = new URLSearchParams({
    fields,
    limit: '200',
    order: 'created_at(desc)',
    ...(search ? { query: search } : {}),
  })

  const res = await fetch(`https://app.clio.com/api/v4/matters.json?${params}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.error?.message ?? `Clio API error ${res.status}`)
  }

  const json: any = await res.json()

  return (json.data ?? []).map((m: any): ImportedMatter => ({
    external_id:   String(m.id),
    name:          m.description ?? `Matter #${m.display_number}`,
    matter_number: m.display_number ?? '',
    status:        m.status ?? 'Unknown',
    source:        'clio',
    parties:       (m.clients ?? []).map((c: any) => ({
      name: c.name ?? 'Unknown',
      role: 'client',
    })),
  }))
}

// ── FileVine fetcher ──────────────────────────────────────────────────────────

async function fetchFileVineMatters(orgId: string, search: string): Promise<ImportedMatter[]> {
  const { data: conn, error } = await db
    .from('la_pm_connections')
    .select('credentials')
    .eq('org_id', orgId)
    .eq('provider', 'filevine')
    .eq('is_active', true)
    .single()
  if (error || !conn) throw new Error('No FileVine connection. Add credentials in Admin → Integrations first.')

  const { api_key, fv_org_id, fv_user_id } = conn.credentials as any
  if (!api_key || !fv_org_id || !fv_user_id) {
    throw new Error('FileVine credentials incomplete. Check Admin → Integrations → FileVine.')
  }

  const headers = {
    Authorization: `Bearer ${api_key}`,
    'x-fv-orgid':  String(fv_org_id),
    'x-fv-userid': String(fv_user_id),
    Accept:        'application/json',
  }

  // Fetch projects list
  const params = new URLSearchParams({ limit: '200', offset: '0' })
  if (search) params.set('filter', search)

  const res = await fetch(`https://api.filevine.io/core/projects?${params}`, { headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any)?.message ?? `FileVine API error ${res.status}`)
  }

  const json: any = await res.json()
  const projects: any[] = json.items ?? json.data ?? []

  // Fetch contacts for first 50 projects in parallel (batched)
  const batch = projects.slice(0, 50)
  const contactResults = await Promise.allSettled(
    batch.map(async (p: any) => {
      const pid = p.projectId?.projectId ?? p.projectId ?? p.id
      if (!pid) return []
      const r = await fetch(`https://api.filevine.io/core/projects/${pid}/contacts?limit=10`, { headers })
      if (!r.ok) return []
      const cj: any = await r.json()
      return (cj.items ?? cj.data ?? []).map((c: any) => ({
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.fullName || 'Unknown',
        role: c.contactType ?? 'client',
      }))
    })
  )

  return batch.map((p: any, i: number): ImportedMatter => {
    const pid     = p.projectId?.projectId ?? p.projectId ?? p.id
    const parties = contactResults[i].status === 'fulfilled' ? (contactResults[i] as any).value : []
    return {
      external_id:   String(pid),
      name:          p.caption ?? p.name ?? `Project ${p.projectNumber ?? pid}`,
      matter_number: String(p.projectNumber ?? ''),
      status:        p.phase ?? p.status ?? 'Unknown',
      source:        'filevine',
      parties,
    }
  })
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  try {
    const { provider, org_id, search = '' } = await req.json()

    if (!provider || !org_id) {
      return new Response(
        JSON.stringify({ error: 'provider and org_id are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let matters: ImportedMatter[]
    if (provider === 'clio') {
      matters = await fetchClioMatters(org_id, search)
    } else if (provider === 'filevine') {
      matters = await fetchFileVineMatters(org_id, search)
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown provider: ${provider}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Filter by search if provider doesn't support server-side search
    const filtered = search
      ? matters.filter(m =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.matter_number.toLowerCase().includes(search.toLowerCase())
        )
      : matters

    return new Response(
      JSON.stringify({ matters: filtered }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  } catch (err: any) {
    console.error('import-pm-matters error:', err)
    return new Response(
      JSON.stringify({ error: err.message ?? 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
