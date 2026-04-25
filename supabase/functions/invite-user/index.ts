// Supabase Edge Function: invite-user
// Generates a Supabase invite link and sends a branded email via Resend.
// Using generateLink (not inviteUserByEmail) gives us full control of the email.
//
// POST body: { email, role, org_id }
// Auth: Bearer <Supabase access token> — caller must be an org admin

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { layout, ctaButton, infoRow, alertBox } from '../_shared/emailTemplate.ts'

const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')              ?? ''
const ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')         ?? ''
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FRONTEND_URL   = Deno.env.get('FRONTEND_URL')              ?? 'https://lexalloc.netlify.app'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')            ?? ''
const RESEND_FROM    = Deno.env.get('RESEND_FROM_EMAIL')         ?? 'noreply@lexalloc.app'

// Admin client for privileged operations (generating links, upserting profiles)
const db = createClient(SUPABASE_URL, SERVICE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Role labels ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin:  'Administrator — full access',
  user:   'Team Member — standard access',
  client: 'Client — view only',
}

// ── Send invite email via Resend ──────────────────────────────────────────────

async function sendInviteEmail(opts: {
  to:        string
  orgName:   string
  role:      string
  inviteUrl: string
  invitedBy: string
}) {
  const { to, orgName, role, inviteUrl, invitedBy } = opts
  const roleLabel = ROLE_LABELS[role] ?? role

  const body = `
    <p style="
      margin:0 0 20px;
      font-size:15px;
      color:#334155;
      line-height:1.7;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    ">
      <strong>${invitedBy}</strong> has invited you to join
      <strong>${orgName}</strong> on LexAlloc — the legal invoice apportionment
      platform used to allocate defense costs across insurers and parties.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
      ${infoRow('Organization', `<strong>${orgName}</strong>`)}
      ${infoRow('Your Role',    roleLabel)}
      ${infoRow('Invited To',   to)}
    </table>

    ${ctaButton('Accept Invitation &amp; Set Your Password', inviteUrl, '#4f46e5')}

    <p style="
      margin:24px 0 0;
      font-size:13px;
      color:#64748b;
      line-height:1.6;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    ">
      Or copy this link into your browser:<br>
      <a href="${inviteUrl}" style="color:#4f46e5;word-break:break-all;">${inviteUrl}</a>
    </p>
  `

  const html = layout({
    title:      `You've been invited to ${orgName}`,
    badgeText:  'Invitation',
    badgeColor: '#4f46e5',
    body,
    footerNote: "If you didn't expect this invitation, you can safely ignore this email.",
  })

  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      from:    RESEND_FROM,
      to:      [to],
      subject: `You've been invited to join ${orgName} on LexAlloc`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).message ?? `Resend error ${res.status}`)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify caller — use user-context client (anon key + their JWT) for auth
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser()
    if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)

    const { email, role = 'user', org_id } = await req.json()
    if (!email || !org_id) return json({ error: 'email and org_id are required' }, 400)

    // Permissions check
    const { data: callerProfile, error: profileErr } = await db
      .from('la_profiles')
      .select('role, org_id, is_platform_admin, first_name, last_name, email')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) return json({ error: 'Could not verify permissions' }, 403)

    const isPlatformAdmin = callerProfile.is_platform_admin === true
    const isOrgAdmin      = callerProfile.role === 'admin'

    if (!isPlatformAdmin) {
      if (!isOrgAdmin)                        return json({ error: 'Only admins can invite users' }, 403)
      if (callerProfile.org_id !== org_id)    return json({ error: 'Cannot invite users to a different organization' }, 403)
    }

    // Fetch org name
    const { data: org } = await db
      .from('la_organizations')
      .select('name')
      .eq('id', org_id)
      .single()
    const orgName = org?.name ?? 'your organization'

    // Generate invite link (does NOT send Supabase's default email)
    const redirectTo = `${FRONTEND_URL}/login`
    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type:    'invite',
      email,
      options: { redirectTo, data: { org_id, role } },
    })

    if (linkErr) {
      if (linkErr.message?.toLowerCase().includes('already been registered')) {
        return json({ error: 'A user with that email already exists.' }, 409)
      }
      throw new Error(linkErr.message)
    }

    const inviteUrl = linkData.properties?.action_link ?? `${FRONTEND_URL}/login`
    const invitedBy = [callerProfile.first_name, callerProfile.last_name].filter(Boolean).join(' ')
                   || callerProfile.email
                   || 'Your administrator'

    // Pre-create profile row
    const { error: upsertErr } = await db
      .from('la_profiles')
      .upsert(
        { id: linkData.user.id, org_id, role, email },
        { onConflict: 'id' }
      )
    if (upsertErr) throw new Error(upsertErr.message)

    // Send branded invite email via Resend
    await sendInviteEmail({ to: email, orgName, role, inviteUrl, invitedBy })

    return json({ success: true, user_id: linkData.user.id })
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
