import pdfParse from 'pdf-parse'

/**
 * Extract raw text from a PDF buffer.
 * @param {Buffer} buffer
 * @returns {Promise<string>}
 */
export async function extractTextFromPdf(buffer) {
  try {
    const { text } = await pdfParse(buffer)
    return text || ''
  } catch (err) {
    console.error('PDF parse error:', err.message)
    return ''
  }
}
