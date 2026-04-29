// Supabase Edge Function: parse-policy
// Uses Anthropic Claude to extract structured data from an insurance policy PDF.
//
// POST body: { fileUrl: string, fileType?: string }
// Returns: { named_insured, insurer_name, policy_number, policy_start, policy_end,
//             policy_limit, claim_number, claims_rep_name, claims_rep_email, portal_url }

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are an insurance policy parsing assistant for a legal claims management system.
Extract structured data from insurance policy documents and return ONLY valid JSON with this exact schema — no markdown, no commentary:
{
  "named_insured":     "string or null (the FIRST named insured / policyholder, e.g. 'ABC General Contractors, Inc.'). This is the entity the policy COVERS — NOT the insurance company issuing it.",
  "insurer_name":      "string or null (the insurance company name, e.g. 'Travelers Insurance', 'USAA')",
  "policy_number":     "string or null (the policy number, e.g. 'GL-2019-001234')",
  "policy_start":      "YYYY-MM-DD or null (the policy period start / effective date)",
  "policy_end":        "YYYY-MM-DD or null (the policy period end / expiration date)",
  "policy_limit":      number or null (the per-occurrence or aggregate coverage limit as a plain number, e.g. 1000000),
  "claim_number":      "string or null (a claim number if present, e.g. 'CLM-2024-009877')",
  "claims_rep_name":   "string or null (the name of the assigned claims adjuster or representative)",
  "claims_rep_email":  "string or null (the email address of the claims representative)",
  "portal_url":        "string or null (the URL of the insurer's online claims portal if shown)"
}

Rules:
- named_insured is the policyholder — look for "Named Insured", "Insured", "Policyholder", or "Insured Name" labels. Use the FIRST named insured if multiple are listed. Drop trailing role descriptors like " — additional insured" or "(loss payee)" if present.
- insurer_name is the insurance company issuing the policy — NOT a law firm or the insured party.
- policy_limit should be the largest stated per-occurrence or per-claim limit. If multiple limits exist, prefer the combined single limit. Return as a plain number (no $ or commas).
- policy_start and policy_end are the policy period dates — look for "Policy Period", "Effective Date", "Expiration Date".
- If a field is not present or cannot be determined, return null for that field.
- Do not guess or invent values — only extract what is clearly stated in the document.`

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
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              fileContentBlock,
              { type: 'text', text: 'Parse this insurance policy document and return the structured JSON:' },
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
