import { Router } from 'express'
import { parseInvoiceWithAI } from '../services/aiExtractor.js'
import { extractTextFromPdf } from '../services/pdfParser.js'

const router = Router()

/**
 * POST /api/invoices/parse
 * Body: { fileUrl, mimeType }
 * Returns structured invoice data extracted by GPT-4
 */
router.post('/parse', async (req, res, next) => {
  try {
    const { fileUrl, mimeType } = req.body
    if (!fileUrl) return res.status(400).json({ error: 'fileUrl is required' })

    // 1. Fetch the file
    const fileRes = await fetch(fileUrl)
    if (!fileRes.ok) throw new Error('Could not fetch file from storage')
    const buffer  = Buffer.from(await fileRes.arrayBuffer())

    // 2. Extract text (PDF → text, images handled via vision)
    let rawText = ''
    if (mimeType === 'application/pdf') {
      rawText = await extractTextFromPdf(buffer)
    }

    // 3. AI extraction
    const parsed = await parseInvoiceWithAI(rawText, fileUrl, mimeType)

    res.json(parsed)
  } catch (err) {
    next(err)
  }
})

export default router
