// Supabase Edge Function: admin-update-profile
// Allows DB Admins to update any user's profile fields (role, org_id, is_platform_admin).
// Uses service role key to bypass RLS — auth check is enforced here instead.
//
// POST body: { target_user_id, patch: { role?, org_id?, is_platform_admin? } }
// Auth: Bearer <Supabase access token> — caller must be a platform admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Decode JWT (verify_jwt: true means gateway already validated it)
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const token = authHeader.replace('Bearer ', '').trim()
    let callerId: string
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      callerId = payload.sub
      if (!callerId) throw new Error('no sub')
    } catch {
      return json({ error: 'Unauthorized' }, 401)
    }

    // Verify caller is a platform admin
    const { data: caller, error: callerErr } = await db
      .from('la_profiles')
      .select('is_platform_admin')
      .eq('id', callerId)
      .single()

    if (callerErr || !caller?.is_platform_admin) {
      return json({ error: 'Only DB Admins can perform this action' }, 403)
    }

    const { target_user_id, patch } = await req.json()
    if (!target_user_id || !patch || typeof patch !== 'object') {
      return json({ error: 'target_user_id and patch are required' }, 400)
    }

    // Whitelist allowed fields — nothing else can be patched via this endpoint
    const allowed: Record<string, boolean> = { role: true, org_id: true, is_platform_admin: true }
    const safePatch = Object.fromEntries(
      Object.entries(patch).filter(([k]) => allowed[k])
    )
    if (Object.keys(safePatch).length === 0) {
      return json({ error: 'No valid fields to update' }, 400)
    }

    // Prevent removing your own platform admin status
    if (callerId === target_user_id && safePatch.is_platform_admin === false) {
      return json({ error: "You can't remove your own DB Admin status" }, 400)
    }

    const { error: updateErr } = await db
      .from('la_profiles')
      .update(safePatch)
      .eq('id', target_user_id)

    if (updateErr) throw new Error(updateErr.message)

    return json({ success: true })
  } catch (err: any) {
    console.error('[admin-update-profile]', err)
    return json({ error: err.message ?? 'Internal server error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
