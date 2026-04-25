import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const APP_URL = process.env.FRONTEND_URL || 'https://lexalloc.netlify.app'

// ── Base sender ───────────────────────────────────────────────────────────────

export async function sendEmail({ to, subject, html }) {
  if (!resend) throw new Error('RESEND_API_KEY not configured')

  const from = process.env.RESEND_FROM_EMAIL || 'noreply@lexalloc.app'

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  })

  if (error) throw new Error(error.message)
  return data
}

// ── Shared layout ─────────────────────────────────────────────────────────────

function layout(title, badge, badgeColor, body) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-email.png" alt="LexAlloc" width="360" style="display:block;height:auto;border:0;max-width:100%;" />
                </td>
                <td align="right">
                  <span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">
                    ${badge}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#0f172a;">${title}</h1>
            ${body}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f1f5f9;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;padding:20px 32px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
              <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-email.png" alt="LexAlloc" width="180" style="display:block;height:auto;margin-bottom:8px;opacity:0.6;" />
              This notification was sent by <strong>LexAlloc</strong> — Legal Invoice Apportionment Platform.<br>
              You are receiving this because you are a member of your organization's LexAlloc account.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:40%;">${label}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;font-weight:500;">${value}</td>
    </tr>`
}

function ctaButton(text, url, color = '#4f46e5') {
  return `
    <table cellpadding="0" cellspacing="0" style="margin-top:24px;">
      <tr>
        <td style="background:${color};border-radius:8px;">
          <a href="${url}" style="display:inline-block;padding:12px 24px;color:#fff;font-weight:600;font-size:14px;text-decoration:none;">${text}</a>
        </td>
      </tr>
    </table>`
}

// ── Event templates ───────────────────────────────────────────────────────────

export async function sendInvoiceParsed({ to, matterName, invoiceNumber, billingFirm, matterId }) {
  const url = `${APP_URL}/matters/${matterId}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      A new invoice has been uploaded and parsed for matter <strong>${matterName}</strong>. Review the extracted line items and run apportionment when ready.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${detailRow('Matter', matterName)}
      ${detailRow('Invoice #', invoiceNumber || '—')}
      ${invoiceNumber ? detailRow('Billing Firm', billingFirm || '—') : ''}
    </table>
    ${ctaButton('View Invoice →', url)}
  `
  return sendEmail({
    to,
    subject: `[LexAlloc] New Invoice Uploaded — ${matterName}`,
    html: layout('New Invoice Uploaded', 'Invoice', '#0ea5e9', body),
  })
}

export async function sendApportionmentReady({ to, matterName, invoiceNumber, method, matterId, apportionmentId }) {
  const url = `${APP_URL}/matters/${matterId}/apportionments/${apportionmentId}`
  const methodLabels = {
    pro_rata_time_on_risk: 'Pro-Rata Time-on-Risk',
    equal_shares:          'Equal Shares',
    limits_proportional:   'Limits-Proportional',
  }
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      An apportionment has been calculated for invoice <strong>${invoiceNumber}</strong> in matter <strong>${matterName}</strong>. Demand letters are ready to generate.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${detailRow('Matter', matterName)}
      ${detailRow('Invoice #', invoiceNumber || '—')}
      ${detailRow('Method', methodLabels[method] || method || '—')}
    </table>
    ${ctaButton('View Apportionment →', url)}
  `
  return sendEmail({
    to,
    subject: `[LexAlloc] Apportionment Ready — ${matterName}`,
    html: layout('Apportionment Calculated', 'Apportionment', '#8b5cf6', body),
  })
}

export async function sendDemandLetterGenerated({ to, matterName, invoiceNumber, insurerName, amount, matterId, apportionmentId }) {
  const url = `${APP_URL}/matters/${matterId}/apportionments/${apportionmentId}`
  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      A demand letter has been generated and downloaded for <strong>${insurerName}</strong> on invoice <strong>${invoiceNumber}</strong> in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${detailRow('Matter', matterName)}
      ${detailRow('Invoice #', invoiceNumber || '—')}
      ${detailRow('Insurer', insurerName || '—')}
      ${amount ? detailRow('Amount Demanded', amount) : ''}
    </table>
    ${ctaButton('View Apportionment →', url)}
  `
  return sendEmail({
    to,
    subject: `[LexAlloc] Demand Letter Generated — ${insurerName} / ${matterName}`,
    html: layout('Demand Letter Generated', 'Demand Letter', '#f59e0b', body),
  })
}

export async function sendPaymentStatusUpdated({ to, matterName, insurerName, newStatus, amount, matterId, apportionmentId }) {
  const url = apportionmentId
    ? `${APP_URL}/matters/${matterId}/apportionments/${apportionmentId}`
    : `${APP_URL}/matters/${matterId}`

  const statusLabels = {
    pending:       'Pending',
    demanded:      'Demanded',
    paid:          'Paid ✓',
    partially_paid:'Partially Paid',
    disputed:      'Disputed',
  }
  const statusColors = {
    paid:          '#16a34a',
    partially_paid:'#2563eb',
    disputed:      '#dc2626',
    demanded:      '#d97706',
    pending:       '#64748b',
  }

  const statusLabel = statusLabels[newStatus] || newStatus
  const statusColor = statusColors[newStatus] || '#64748b'

  const body = `
    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.6;">
      Payment status has been updated for <strong>${insurerName}</strong> in matter <strong>${matterName}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      ${detailRow('Matter', matterName)}
      ${detailRow('Insurer', insurerName || '—')}
      ${detailRow('New Status', `<span style="background:${statusColor}22;color:${statusColor};padding:2px 10px;border-radius:20px;font-weight:600;font-size:12px;">${statusLabel}</span>`)}
      ${amount ? detailRow('Amount', amount) : ''}
    </table>
    ${ctaButton('View Matter →', url)}
  `
  return sendEmail({
    to,
    subject: `[LexAlloc] Payment Status Updated — ${insurerName} marked ${statusLabel}`,
    html: layout('Payment Status Updated', 'Payment', statusColor, body),
  })
}
