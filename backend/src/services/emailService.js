import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendEmail({ to, subject, html, matter_name }) {
  if (!resend) throw new Error('RESEND_API_KEY not configured')

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@lexalloc.app'

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html: html || `<p>LexAlloc notification regarding matter: <strong>${matter_name}</strong></p>`,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function sendApportionmentReady({ to, matterName, invoiceNumber, appUrl }) {
  return sendEmail({
    to,
    subject: `[LexAlloc] Apportionment Ready — ${matterName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#4f46e5;">LexAlloc — Apportionment Ready</h2>
        <p>The apportionment for invoice <strong>${invoiceNumber}</strong> in matter
        <strong>${matterName}</strong> has been calculated.</p>
        <a href="${appUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:12px;">
          View Breakdown
        </a>
        <p style="color:#94a3b8;font-size:12px;margin-top:24px;">LexAlloc Legal Invoice Apportionment Platform</p>
      </div>
    `,
  })
}
