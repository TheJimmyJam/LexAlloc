import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

// Uses service role to call auth admin APIs
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * POST /api/invitations/invite
 * Body: { email, role, org_id }
 * Sends a Supabase magic-link invite email and pre-creates the profile row.
 * Only org admins can invite.
 */
router.post('/invite', async (req, res, next) => {
  try {
    const { email, role = 'user', org_id } = req.body
    if (!email || !org_id) {
      return res.status(400).json({ error: 'email and org_id are required' })
    }

    // Verify requesting user is an admin of the same org
    const { data: inviterProfile, error: profileErr } = await supabaseAdmin
      .from('la_profiles')
      .select('role, org_id')
      .eq('id', req.user.id)
      .single()

    if (profileErr || !inviterProfile) {
      return res.status(403).json({ error: 'Could not verify permissions' })
    }
    if (inviterProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can invite users' })
    }
    if (inviterProfile.org_id !== org_id) {
      return res.status(403).json({ error: 'Cannot invite users to a different organization' })
    }

    // Send invite via Supabase — creates the auth user and fires the invite email
    const redirectTo = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/login`
      : 'http://localhost:5173/login'

    const { data, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { org_id, role },
        redirectTo,
      }
    )

    if (inviteErr) {
      // Surface a readable message for common cases
      if (inviteErr.message?.includes('already been registered')) {
        return res.status(409).json({ error: 'A user with that email already exists.' })
      }
      throw new Error(inviteErr.message)
    }

    // Pre-create profile so org_id + role are ready on first login
    const { error: upsertErr } = await supabaseAdmin
      .from('la_profiles')
      .upsert(
        { id: data.user.id, org_id, role, email },
        { onConflict: 'id' }
      )

    if (upsertErr) throw new Error(upsertErr.message)

    res.json({ success: true, user_id: data.user.id })
  } catch (err) {
    next(err)
  }
})

export default router
