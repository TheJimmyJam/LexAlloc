import { Router } from 'express'
import { sendEmail } from '../services/emailService.js'

const router = Router()

router.post('/send', async (req, res, next) => {
  try {
    const { to, subject, html, matter_name } = req.body
    if (!to || !subject) return res.status(400).json({ error: 'to and subject are required' })
    const result = await sendEmail({ to, subject, html, matter_name })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
