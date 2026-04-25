// Supabase Edge Function: invite-user
// Sends a Supabase magic-link invite and pre-creates the la_profiles row.
//
// POST body: { email, role, org_id }
// Auth: Bearer <Supabase access token> — caller must be an org admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth: verify caller is a logged-in Supabase user ──────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token      = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { data: { user: caller }, error: authErr } = await db.auth.getUser(token)
    if (authErr || !caller) {
      return json({ error: 'Unauthorized' }, 401)
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    const { email, role = 'user', org_id } = await req.json()
    if (!email || !org_id) {
      return json({ error: 'email and org_id are required' }, 400)
    }

    // ── Permissions: caller must be admin of the target org ───────────────────
    const { data: callerProfile, error: profileErr } = await db
      .from('la_profiles')
      .select('role, org_id, is_platform_admin')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) {
      return json({ error: 'Could not verify permissions' }, 403)
    }

    const isPlatformAdmin = callerProfile.is_platform_admin === true
    const isOrgAdmin      = callerProfile.role === 'admin'

    // Platform admins can invite to any org; org admins only to their own
    if (!isPlatformAdmin) {
      if (!isOrgAdmin) {
        return json({ error: 'Only admins can invite users' }, 403)
      }
      if (callerProfile.org_id !== org_id) {
        return json({ error: 'Cannot invite users to a different organization' }, 403)
      }
    }

    // ── Send invite via Supabase auth admin ───────────────────────────────────
    const redirectTo = `${FRONTEND_URL}/login`

    const { data, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
      data: { org_id, role },
      redirectTo,
    })

    if (inviteErr) {
      if (inviteErr.message?.toLowerCase().includes('already been registered')) {
        return json({ error: 'A user with that email already exists.' }, 409)
      }
      throw new Error(inviteErr.message)
    }

    // ── Pre-create la_profiles row ────────────────────────────────────────────
    const { error: upsertErr } = await db
      .from('la_profiles')
      .upsert(
        { id: data.user.id, org_id, role, email },
        { onConflict: 'id' }
      )

    if (upsertErr) throw new Error(upsertErr.message)

    return json({ success: true, user_id: data.user.id })
  } catch (err: any) {
    console.error('[invite-user]', err)
    return json({ error: err.message ?? 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
