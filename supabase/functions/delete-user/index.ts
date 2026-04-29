// Supabase Edge Function: delete-user
// Permanently deletes a user from Supabase Auth + their profile.
// Requires the caller to be an admin of the same org (or platform admin).
//
// POST body: { target_user_id: string }
// Auth: Bearer <Supabase access token>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const db = createClient(SUPABASE_URL, SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Decode caller identity from JWT
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

    // Load caller profile
    const { data: caller, error: callerErr } = await db
      .from('la_profiles')
      .select('role, org_id, is_platform_admin')
      .eq('id', callerId)
      .single()

    if (callerErr || !caller) return json({ error: 'Unauthorized' }, 401)

    // Must be org admin or platform admin
    if (caller.role !== 'admin' && !caller.is_platform_admin) {
      return json({ error: 'Only admins can remove users' }, 403)
    }

    const { target_user_id } = await req.json()
    if (!target_user_id) return json({ error: 'target_user_id is required' }, 400)

    // Cannot delete yourself
    if (target_user_id === callerId) {
      return json({ error: "You can't delete your own account" }, 400)
    }

    // Load target profile — ensure they belong to the same org (unless platform admin)
    const { data: target, error: targetErr } = await db
      .from('la_profiles')
      .select('org_id, role')
      .eq('id', target_user_id)
      .single()

    if (targetErr || !target) return json({ error: 'User not found' }, 404)

    if (!caller.is_platform_admin && target.org_id !== caller.org_id) {
      return json({ error: 'Cannot delete users outside your organization' }, 403)
    }

    // Cannot delete another platform admin unless you are one too
    if (target.role === 'admin' && !caller.is_platform_admin) {
      return json({ error: 'Only platform admins can remove org admins' }, 403)
    }

    // Delete from Supabase Auth (cascades to la_profiles via FK on delete cascade)
    const { error: deleteErr } = await db.auth.admin.deleteUser(target_user_id)
    if (deleteErr) throw new Error(deleteErr.message)

    return json({ success: true })
  } catch (err: any) {
    console.error('[delete-user]', err)
    return json({ error: err.message ?? 'Internal server error' }, 500)
  }
})
