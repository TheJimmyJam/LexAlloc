import { Router } from 'express'
import { calcTimeOnRisk } from '../services/calculator.js'

const router = Router()

/**
 * POST /api/apportionments/calculate
 * Body: { invoice, parties }
 * Returns full apportionment breakdown JSON
 */
router.post('/calculate', async (req, res, next) => {
  try {
    const { invoice, parties } = req.body
    if (!invoice || !parties) {
      return res.status(400).json({ error: 'invoice and parties are required' })
    }
    const result = calcTimeOnRisk(invoice, parties)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
