// Supabase Edge Function: parse-invoice
// Uses Anthropic Claude to extract structured data from a legal invoice PDF or image.
//
// POST body: { fileUrl: string, fileType: string }
// Returns: { invoice_number, invoice_date, billing_firm, matter_name, matter_number,
//             total_amount, service_start, service_end, line_items: [...] }

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are a legal invoice parsing assistant.
Extract structured data from legal invoices and return ONLY valid JSON with this exact schema — no markdown, no commentary:
{
  "invoice_number":  "string or null",
  "invoice_date":    "YYYY-MM-DD or null",
  "billing_firm":    "string or null (the law firm or vendor issuing the invoice)",
  "matter_name":     "string or null (the case or matter caption shown on the invoice, e.g. 'Smith v. Acme Corp — Employment Dispute')",
  "matter_number":   "string or null (the matter/file/reference number shown on the invoice, e.g. '2025-MDN-0047')",
  "total_amount":    number,
  "service_start":   "YYYY-MM-DD or null (earliest date of service in the invoice)",
  "service_end":     "YYYY-MM-DD or null (latest date of service in the invoice)",
  "line_items": [
    {
      "date":         "YYYY-MM-DD or null",
      "description":  "string",
      "timekeeper":   "string or null",
      "hours":        number or null,
      "rate":         number or null,
      "amount":       number,
      "category":     "fees | costs | expenses | disbursements"
    }
  ]
}

Rules:
- matter_name is the litigation/matter caption (NOT the billing firm name). Look for a field labeled "Matter", "Re:", or "Case" on the invoice.
- matter_number is the client or firm reference number for the matter (NOT the invoice number). Look for "Matter No.", "File No.", "Ref:", etc.
- billing_firm is who sent the invoice (the law firm or vendor at the top).
- total_amount is the current invoice total only (not a cumulative balance due).
- Be thorough — extract every billing entry as a separate line item.
- For costs/expenses, hours and rate may be null.
- If the document contains multiple invoices, parse only the FIRST invoice.`

// Safe base64 encoding for large files (avoids call stack overflow)
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { fileUrl, fileType } = await req.json()

    if (!fileUrl) {
      return new Response(
        JSON.stringify({ error: 'fileUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download and base64-encode the file
    const fileResp = await fetch(fileUrl)
    if (!fileResp.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch file: ${fileResp.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const fileBytes  = await fileResp.arrayBuffer()
    const base64Data = toBase64(fileBytes)
    const mimeType   = fileType || fileResp.headers.get('content-type') || 'application/octet-stream'
    const isPdf      = mimeType.includes('pdf')

    // Build the content block — Claude supports PDFs natively as "document" type
    const fileContentBlock = isPdf
      ? {
          type: 'document',
          source: {
            type:       'base64',
            media_type: 'application/pdf',
            data:       base64Data,
          },
        }
      : {
          type: 'image',
          source: {
            type:       'base64',
            media_type: mimeType,
            data:       base64Data,
          },
        }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              fileContentBlock,
              { type: 'text', text: 'Parse this legal invoice and return the structured JSON:' },
            ],
          },
        ],
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      return new Response(
        JSON.stringify({ error: `Anthropic error: ${resp.status} ${errBody}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const json  = await resp.json()
    const raw   = json.content?.[0]?.text || '{}'
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let result
    try {
      result = JSON.parse(clean)
    } catch {
      return new Response(
        JSON.stringify({ error: 'AI returned malformed JSON — try again' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
