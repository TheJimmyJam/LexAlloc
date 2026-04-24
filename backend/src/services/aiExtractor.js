import OpenAI from 'openai'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

const SYSTEM_PROMPT = `You are a legal invoice parsing assistant.
Extract structured data from legal invoices and return ONLY valid JSON with this schema:
{
  "invoice_number":  "string or null",
  "invoice_date":    "YYYY-MM-DD or null",
  "billing_firm":    "string or null",
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
Be thorough — extract every billing entry as a line item.
For costs/expenses, hours and rate may be null. Return only JSON, no markdown.`

/**
 * Use GPT-4 to extract structured invoice data.
 * Falls back to empty structure if AI is unavailable.
 * @param {string} rawText   - PDF text content
 * @param {string} fileUrl   - Public URL (used for vision if text extraction failed)
 * @param {string} mimeType
 */
export async function parseInvoiceWithAI(rawText, fileUrl, mimeType) {
  if (!openai) {
    throw new Error('OPENAI_API_KEY not configured — AI parsing unavailable')
  }

  let messages

  if (rawText && rawText.length > 50) {
    // Use text-based extraction (faster, cheaper)
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Parse this legal invoice:\n\n${rawText.slice(0, 12000)}` },
    ]
  } else {
    // Fall back to vision for image-based PDFs or image uploads
    messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Parse this legal invoice image:' },
          { type: 'image_url', image_url: { url: fileUrl, detail: 'high' } },
        ],
      },
    ]
  }

  const resp = await openai.chat.completions.create({
    model:       'gpt-4o',
    messages,
    temperature: 0,
    max_tokens:  4096,
  })

  const content = resp.choices[0]?.message?.content || '{}'
  const clean   = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(clean)
  } catch {
    throw new Error('AI returned invalid JSON — try again or use manual entry')
  }
}
