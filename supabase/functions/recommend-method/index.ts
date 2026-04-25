// Supabase Edge Function: recommend-method
// Uses Anthropic Claude to recommend a legal cost allocation method for a given matter.
//
// POST body: { matter_name, matter_number, invoice_total, service_start, service_end,
//              current_method, carriers_count, parties: [...] }
// Auth: Bearer <Supabase access token>

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are a legal apportionment advisor with deep expertise in insurance coverage disputes, long-tail liability claims, and allocation methodologies used in U.S. litigation.

Given facts about a matter — service period, number of insurers, policy periods, policy limits, and party obligation dates — recommend the most legally defensible calculation method for allocating legal defense costs among triggered insurers within each party's obligation.

Available methods:
1. pro_rata_time_on_risk: Allocates costs proportional to each insurer's raw policy duration relative to the total coverage days across all insurers for that party. Most defensible for continuous-trigger, long-tail claims (e.g., environmental, construction defect, long-running bodily injury) where each policy year bears independent risk exposure.
2. equal_shares: Divides costs equally among all triggered policies. Used when exposure timing is indeterminate, carriers agree to split without apportionment, or policy periods are virtually identical in length.
3. limits_proportional: Allocates based on each insurer's policy limit relative to the total of all limits. Best suited for single-occurrence or short-tail claims where temporal differentiation is meaningless, or where carriers have materially different towers of coverage.

Analyze the provided facts and return ONLY valid JSON in exactly this schema — no markdown, no commentary:
{
  "recommended_method": "pro_rata_time_on_risk" | "equal_shares" | "limits_proportional",
  "confidence": "high" | "medium" | "low",
  "key_factors": ["string", "string", "string"],
  "rationale": "2-3 sentence explanation of why this method is most defensible given these specific facts",
  "caveats": "string describing jurisdiction-specific considerations, alternative approaches, or data gaps — or null if none"
}`

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

    const {
      matter_name,
      matter_number,
      invoice_total,
      service_start,
      service_end,
      current_method,
      carriers_count,
      parties = [],
    } = await req.json()

    if (!service_start) {
      return new Response(
        JSON.stringify({ error: 'service_start is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const partyLines = parties.map((p: any, i: number) => {
      const periods = (p.policy_periods || []).map((pp: any) => {
        const limit = pp.limit_usd ? ` | limit $${Number(pp.limit_usd).toLocaleString()}` : ''
        return `      Period: ${pp.start} -> ${pp.end || 'present'}${limit}`
      }).join('\n')
      return `  Party ${i + 1}: ${p.name} - ${p.share_pct}% share\n${periods}`
    }).join('\n')

    const allPeriods  = parties.flatMap((p: any) => p.policy_periods || [])
    const hasLimits   = allPeriods.some((pp: any) => pp.limit_usd && Number(pp.limit_usd) > 0)
    const uniqueCount = carriers_count || allPeriods.length

    const context = [
      `Matter: ${matter_name || 'Unnamed Matter'}${matter_number ? ` (${matter_number})` : ''}`,
      `Invoice Total: $${Number(invoice_total || 0).toLocaleString()}`,
      `Service Period: ${service_start} to ${service_end || service_start}`,
      `Current Method: ${current_method || 'not yet selected'}`,
      `Number of Carriers: ${uniqueCount}`,
      `Policy Limits Data Available: ${hasLimits ? 'Yes' : 'No'}`,
      '',
      'Parties and Policy Periods:',
      partyLines || '  No party data provided',
    ].join('\n')

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     SYSTEM_PROMPT,
        messages: [
          {
            role:    'user',
            content: `Analyze this matter and recommend the most defensible allocation method:\n\n${context}`,
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
        JSON.stringify({ error: 'AI returned malformed response - try again' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!result.recommended_method || !result.rationale) {
      return new Response(
        JSON.stringify({ error: 'AI response missing required fields - try again' }),
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
