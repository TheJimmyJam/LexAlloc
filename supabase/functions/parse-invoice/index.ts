// Supabase Edge Function: parse-invoice
// Uses OpenAI (GPT-4o vision) to extract structured data from a legal invoice PDF or image.
//
// POST body: { fileUrl: string, fileType: string }
// Returns: { invoice_number, invoice_date, billing_firm, matter_name, matter_number,
//             total_amount, service_start, service_end, line_items: [...] }

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? ''

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
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

    // Download the file and base64-encode it (chunked to avoid call stack overflow on large files)
    const fileResp = await fetch(fileUrl)
    if (!fileResp.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch file: ${fileResp.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const fileBytes = await fileResp.arrayBuffer()
    const bytes     = new Uint8Array(fileBytes)
    let binary      = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64Data = btoa(binary)

    // Detect whether this is a PDF or an image
    const mimeType   = fileType || fileResp.headers.get('content-type') || 'application/octet-stream'
    const isPdf      = mimeType.includes('pdf')

    // Build the file content block for OpenAI
    const fileContentBlock = isPdf
      ? {
          type: 'file',
          file: {
            filename: 'invoice.pdf',
            file_data: `data:application/pdf;base64,${base64Data}`,
          },
        }
      : {
          type: 'image_url',
          image_url: {
            url:    `data:${mimeType};base64,${base64Data}`,
            detail: 'high',
          },
        }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Parse this legal invoice and return the structured JSON:' },
              fileContentBlock,
            ],
          },
        ],
        temperature: 0,
        max_tokens:  4096,
      }),
    })

    if (!resp.ok) {
      const errBody = await resp.text()
      return new Response(
        JSON.stringify({ error: `OpenAI error: ${resp.status} ${errBody}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const json    = await resp.json()
    const raw     = json.choices?.[0]?.message?.content || '{}'
    const clean   = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

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
