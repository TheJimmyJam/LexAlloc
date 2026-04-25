import { Router }  from 'express'
import OpenAI      from 'openai'

const router = Router()

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a legal apportionment advisor with deep expertise in insurance coverage disputes, \
long-tail liability claims, and allocation methodologies used in U.S. litigation.

Given facts about a matter — claim type, service period, number of insurers, policy overlaps, \
policy limits, and jurisdiction — recommend the most legally defensible calculation method for \
allocating legal defense costs among triggered insurers.

Available methods:
1. pro_rata_time_on_risk: Allocates costs proportional to each insurer's policy period that \
overlaps with the invoice service dates. Most defensible for continuous-trigger, long-tail \
claims (e.g., environmental, construction defect, long-running bodily injury) where each \
policy year bears independent risk exposure. Widely accepted by courts and arbitrators.
2. equal_shares: Divides costs equally among all triggered policies regardless of period \
length. Used when exposure timing is indeterminate, carriers agree to split without \
apportionment, or policy periods are virtually identical in length.
3. limits_proportional: Allocates based on each insurer's policy limit relative to the \
total of all limits. Best suited for single-occurrence or short-tail claims where temporal \
differentiation is meaningless, or where carriers have materially different towers of coverage.

Analyze the provided facts and return ONLY valid JSON in exactly this schema — no markdown, no commentary:
{
  "recommended_method": "pro_rata_time_on_risk" | "equal_shares" | "limits_proportional",
  "confidence": "high" | "medium" | "low",
  "key_factors": ["string", "string", "string"],
  "rationale": "2-3 sentence explanation of why this method is most defensible given these specific facts",
  "caveats": "string describing jurisdiction-specific considerations, alternative approaches, or data gaps — or null if none"
}`

/**
 * POST /api/ai/recommend-method
 * Body: {
 *   matter_name, matter_number,
 *   invoice_total, service_start, service_end,
 *   current_method,
 *   carriers_count,
 *   parties: [{ name, type, share_pct, policy_periods: [{ start, end, limit_usd }] }]
 * }
 */
router.post('/recommend-method', async (req, res, next) => {
  try {
    if (!openai) {
      return res.status(503).json({ error: 'OPENAI_API_KEY not configured on this server' })
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
    } = req.body

    if (!service_start) {
      return res.status(400).json({ error: 'service_start is required' })
    }

    // ── Build a structured, token-efficient context string ────────────────────
    const partyLines = parties.map((p, i) => {
      const periods = (p.policy_periods || []).map(pp => {
        const limit = pp.limit_usd ? ` | limit $${Number(pp.limit_usd).toLocaleString()}` : ''
        return `      Period: ${pp.start} → ${pp.end}${limit}`
      }).join('\n')
      return `  Party ${i + 1}: ${p.name} (${p.type || 'party'}) — ${p.share_pct}% share\n${periods}`
    }).join('\n')

    // Detect policy period overlap (simple heuristic: are any policy periods identical in length?)
    const allPeriods = parties.flatMap(p => p.policy_periods || [])
    const hasLimitsData = allPeriods.some(pp => pp.limit_usd && Number(pp.limit_usd) > 0)
    const uniqueCarriers = new Set(parties.flatMap(p =>
      (p.policy_periods || []).map(pp => pp.insurer_name || 'unknown')
    )).size

    const context = `
Matter: ${matter_name || 'Unnamed Matter'}${matter_number ? ` (${matter_number})` : ''}
Invoice Total: $${Number(invoice_total || 0).toLocaleString()}
Service Period: ${service_start} to ${service_end || service_start}
Current Method: ${current_method || 'not yet selected'}
Number of Carriers: ${carriers_count || uniqueCarriers || allPeriods.length}
Policy Limits Data Available: ${hasLimitsData ? 'Yes' : 'No'}

Parties and Policy Periods:
${partyLines || '  No party data provided'}
`.trim()

    const resp = await openai.chat.completions.create({
      model:       'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: `Analyze this matter and recommend the most defensible allocation method:\n\n${context}` },
      ],
      temperature: 0.2,
      max_tokens:  600,
    })

    const raw   = resp.choices[0]?.message?.content || '{}'
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let result
    try {
      result = JSON.parse(clean)
    } catch {
      return res.status(500).json({ error: 'AI returned malformed response — try again' })
    }

    // Validate expected fields are present
    if (!result.recommended_method || !result.rationale) {
      return res.status(500).json({ error: 'AI response missing required fields — try again' })
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
