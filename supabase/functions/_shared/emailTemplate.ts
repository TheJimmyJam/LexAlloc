/**
 * Shared LexAlloc email template.
 * All transactional emails use this layout so every email looks identical.
 *
 * Usage:
 *   import { layout, infoRow, ctaButton, divider } from '../_shared/emailTemplate.ts'
 */

// ── Logo mark ─────────────────────────────────────────────────────────────────
// SVG is not safe in email; we use an HTML table-based wordmark instead.
// The indigo square + "LexAlloc" wordmark in white is the brand anchor.

const LOGO_HTML = `
<a href="https://lexalloc.app" style="text-decoration:none;display:block;">
  <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-email.png"
       alt="LexAlloc" width="440"
       style="display:block;height:auto;border:0;outline:none;max-width:100%;" />
</a>`

// ── Badge / chip ──────────────────────────────────────────────────────────────

export function badge(text: string, color: string): string {
  return `<span style="
    background:${color};
    color:#ffffff;
    font-size:11px;
    font-weight:700;
    padding:4px 12px;
    border-radius:20px;
    text-transform:uppercase;
    letter-spacing:0.5px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  ">${text}</span>`
}

// ── Info table row ────────────────────────────────────────────────────────────

export function infoRow(label: string, value: string): string {
  return `
  <tr>
    <td style="
      padding:10px 0;
      border-bottom:1px solid #f1f5f9;
      font-size:13px;
      color:#64748b;
      width:38%;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      vertical-align:top;
    ">${label}</td>
    <td style="
      padding:10px 0;
      border-bottom:1px solid #f1f5f9;
      font-size:13px;
      color:#0f172a;
      font-weight:500;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
      vertical-align:top;
    ">${value}</td>
  </tr>`
}

// ── CTA button ────────────────────────────────────────────────────────────────

export function ctaButton(text: string, url: string, color = '#4f46e5'): string {
  return `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:28px;">
    <tr>
      <td style="
        background:${color};
        border-radius:8px;
        mso-padding-alt:0;
      ">
        <a href="${url}"
           style="
             display:inline-block;
             padding:14px 28px;
             color:#ffffff;
             font-weight:600;
             font-size:14px;
             text-decoration:none;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
             letter-spacing:0.1px;
           ">${text} &rarr;</a>
      </td>
    </tr>
  </table>`
}

// ── Alert / callout box ───────────────────────────────────────────────────────

export function alertBox(text: string, bg: string, border: string, textColor: string): string {
  return `
  <div style="
    background:${bg};
    border-left:4px solid ${border};
    border-radius:0 6px 6px 0;
    padding:14px 16px;
    margin:0 0 20px;
    font-size:13px;
    color:${textColor};
    line-height:1.6;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  ">${text}</div>`
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function divider(): string {
  return `<div style="height:1px;background:#f1f5f9;margin:24px 0;"></div>`
}

// ── Master layout ─────────────────────────────────────────────────────────────

export interface LayoutOptions {
  title:      string
  badgeText:  string
  badgeColor: string
  body:       string
  footerNote?: string  // extra line in footer (e.g. "If you didn't request this, ignore it.")
}

export function layout(opts: LayoutOptions): string {
  const { title, badgeText, badgeColor, body, footerNote } = opts

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#f1f5f9;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${title} — LexAlloc Legal Invoice Apportionment</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Outer card: max 600px -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- ── Header ─────────────────────────────────────────── -->
          <tr>
            <td style="
              background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);
              padding:28px 32px;
            ">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="vertical-align:middle;">${LOGO_HTML}</td>
                  <td align="right" style="vertical-align:middle;">${badge(badgeText, badgeColor)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Title strip ────────────────────────────────────── -->
          <tr>
            <td style="
              background:#ffffff;
              padding:28px 32px 0;
              border-left:1px solid #e2e8f0;
              border-right:1px solid #e2e8f0;
            ">
              <h1 style="
                margin:0;
                font-size:22px;
                font-weight:700;
                color:#0f172a;
                line-height:1.3;
                font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
              ">${title}</h1>
            </td>
          </tr>

          <!-- ── Body ──────────────────────────────────────────── -->
          <tr>
            <td style="
              background:#ffffff;
              padding:20px 32px 32px;
              border-left:1px solid #e2e8f0;
              border-right:1px solid #e2e8f0;
            ">
              ${body}
            </td>
          </tr>

          <!-- ── Footer ────────────────────────────────────────── -->
          <tr>
            <td style="
              background:#f8fafc;
              border:1px solid #e2e8f0;
              border-top:none;
              border-radius:0 0 14px 14px;
              padding:20px 32px;
            ">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td>
                    <!-- Footer logo -->
                    <div style="margin-bottom:12px;">
                      <img src="https://raw.githubusercontent.com/TheJimmyJam/LexAlloc/main/frontend/public/logo-email.png" alt="LexAlloc" width="200" style="display:block;height:auto;opacity:0.6;" />
                    </div>

                    <p style="
                      margin:0 0 6px;
                      font-size:12px;
                      color:#94a3b8;
                      line-height:1.6;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                    ">Legal Invoice Apportionment Platform &mdash; <a href="https://lexalloc.netlify.app" style="color:#94a3b8;text-decoration:underline;">lexalloc.netlify.app</a></p>

                    <p style="
                      margin:0;
                      font-size:12px;
                      color:#94a3b8;
                      line-height:1.6;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
                    ">You receive this email because you are a member of your organization's LexAlloc account.${footerNote ? `<br>${footerNote}` : ''}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}
