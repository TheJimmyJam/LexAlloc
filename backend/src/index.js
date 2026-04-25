import 'dotenv/config'
import express    from 'express'
import cors       from 'cors'
import invoiceRoutes    from './routes/invoices.js'
import apportRoutes     from './routes/apportionments.js'
import notifRoutes      from './routes/notifications.js'
import inviteRoutes     from './routes/invitations.js'
import billingRoutes, { webhookHandler } from './routes/billing.js'

const app  = express()
const PORT = process.env.PORT || 8080

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}))

// Stripe webhook must receive the raw body BEFORE express.json() parses it
app.post('/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ── Auth middleware ───────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

app.use('/api', async (req, res, next) => {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = auth.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })
  req.user = user
  next()
})

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))
app.use('/api/invoices',       invoiceRoutes)
app.use('/api/apportionments', apportRoutes)
app.use('/api/notifications',  notifRoutes)
app.use('/api/invitations',    inviteRoutes)
app.use('/api/billing',        billingRoutes)

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

app.listen(PORT, () => console.log(`🚀 LexAlloc API running on port ${PORT}`))
