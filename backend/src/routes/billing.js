/**
 * billing.js — Stripe subscription billing routes
 *
 * Routes (authenticated via global middleware unless noted):
 *   GET  /api/billing/subscription          Current org subscription info
 *   POST /api/billing/checkout              Create Stripe Checkout Session → return URL
 *   POST /api/billing/portal               Create Stripe Customer Portal session → return URL
 *   POST /billing/webhook                  Stripe webhook (raw body, no auth)
 */

import { Router }   from 'express'
import Stripe       from 'stripe'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ── Plan definitions ──────────────────────────────────────────────────────────
// Stripe Price IDs come from env vars so they can differ between test/live
const PRICE_IDS = {
  professional: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    annual:  process.env.STRIPE_PRICE_PRO_ANNUAL,
  },
}

const PLAN_META = {
  starter: {
    id:        'starter',
    name:      'Starter',
    tagline:   'For small teams getting started',
    price:     { monthly: 0, annual: 0 },
    seats:     3,
    matters:   10,
    features:  ['Up to 3 users', '10 active matters', 'Core apportionment methods', 'Email support'],
  },
  professional: {
    id:        'professional',
    name:      'Professional',
    tagline:   'For growing firms that need more',
    price:     { monthly: 49, annual: 39 },   // per seat / month
    seats:     'unlimited',
    matters:   'unlimited',
    features:  ['Unlimited users', 'Unlimited matters', 'All calculation methods', 'Audit log', '2FA / MFA', 'Custom % overrides', 'Policy limit alerts', 'Priority support'],
  },
  enterprise: {
    id:        'enterprise',
    name:      'Enterprise',
    tagline:   'Custom pricing for large firms',
    price:     { monthly: 'custom', annual: 'custom' },
    seats:     'unlimited',
    matters:   'unlimited',
    features:  ['Everything in Professional', 'SSO / SAML', 'Custom integrations', 'Dedicated CSM', 'SLA guarantee', 'On-premise option'],
  },
}

// ── Helper: get org from authed user ─────────────────────────────────────────
async function getOrgForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from('la_profiles')
    .select('org_id, role, la_organizations(*)')
    .eq('id', userId)
    .single()
  if (error || !data) return null
  return { profile: data, org: data.la_organizations }
}

// ── Helper: ensure Stripe customer exists for org ────────────────────────────
async function ensureStripeCustomer(org, userEmail) {
  if (org.stripe_customer_id) return org.stripe_customer_id

  const customer = await stripe.customers.create({
    email:    userEmail,
    name:     org.name,
    metadata: { org_id: org.id },
  })

  await supabaseAdmin
    .from('la_organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', org.id)

  return customer.id
}

// ── GET /api/billing/subscription ────────────────────────────────────────────
router.get('/subscription', async (req, res) => {
  try {
    const result = await getOrgForUser(req.user.id)
    if (!result) return res.status(404).json({ error: 'Org not found' })

    const { org } = result

    // Fetch live data from Stripe if we have a subscription
    let stripeData = null
    if (org.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id, {
          expand: ['latest_invoice', 'items.data.price.product'],
        })
        stripeData = {
          status:           sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          canceled_at:      sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
        }
      } catch { /* subscription might be deleted */ }
    }

    res.json({
      plan:               org.plan_id || 'starter',
      status:             org.subscription_status || 'active',
      seat_count:         org.seat_count || 3,
      billing_interval:   org.billing_interval || 'monthly',
      period_end:         org.subscription_current_period_end,
      trial_ends_at:      org.trial_ends_at,
      stripe_customer_id: org.stripe_customer_id,
      has_subscription:   !!org.stripe_subscription_id,
      plan_meta:          PLAN_META,
      stripe:             stripeData,
    })
  } catch (err) {
    console.error('billing/subscription error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/billing/checkout ───────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  try {
    const { plan = 'professional', seats = 1, interval = 'monthly' } = req.body

    if (plan === 'enterprise') {
      return res.json({ redirect_url: 'mailto:sales@lexalloc.com?subject=Enterprise%20Inquiry' })
    }

    const priceId = PRICE_IDS[plan]?.[interval]
    if (!priceId) return res.status(400).json({ error: `No price configured for ${plan}/${interval}` })

    const result = await getOrgForUser(req.user.id)
    if (!result) return res.status(404).json({ error: 'Org not found' })

    // Only admins can change billing
    if (!['admin', 'owner'].includes(result.profile.role)) {
      return res.status(403).json({ error: 'Only org admins can manage billing' })
    }

    const { data: userRow } = await supabaseAdmin.auth.admin.getUserById(req.user.id)
    const email = userRow?.user?.email || ''

    const customerId = await ensureStripeCustomer(result.org, email)
    const appUrl     = process.env.APP_URL || 'https://app.lexalloc.com'

    const session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: priceId, quantity: seats }],
      success_url: `${appUrl}/admin?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/admin?tab=billing&billing=canceled`,
      subscription_data: {
        metadata: { org_id: result.org.id, plan, interval },
      },
      metadata: { org_id: result.org.id, plan, seats: String(seats), interval },
      allow_promotion_codes: true,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('billing/checkout error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /api/billing/portal ─────────────────────────────────────────────────
router.post('/portal', async (req, res) => {
  try {
    const result = await getOrgForUser(req.user.id)
    if (!result) return res.status(404).json({ error: 'Org not found' })
    if (!result.org.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found. Upgrade to a paid plan first.' })
    }

    const appUrl = process.env.APP_URL || 'https://app.lexalloc.com'
    const session = await stripe.billingPortal.sessions.create({
      customer:   result.org.stripe_customer_id,
      return_url: `${appUrl}/admin?tab=billing`,
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('billing/portal error', err)
    res.status(500).json({ error: err.message })
  }
})

// ── POST /billing/webhook (no auth, raw body) ─────────────────────────────────
// Mounted at /billing/webhook in index.js (before json middleware)
export async function webhookHandler(req, res) {
  const sig    = req.headers['stripe-signature']
  const secret = process.env.STRIPE_WEBHOOK_SECRET

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      // ── Checkout completed: subscription created ──────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription') break

        const orgId    = session.metadata?.org_id
        const plan     = session.metadata?.plan || 'professional'
        const seats    = parseInt(session.metadata?.seats || '1', 10)
        const interval = session.metadata?.interval || 'monthly'

        if (!orgId) break

        // Retrieve the created subscription for period details
        const sub = await stripe.subscriptions.retrieve(session.subscription)
        await supabaseAdmin
          .from('la_organizations')
          .update({
            stripe_subscription_id:         sub.id,
            stripe_customer_id:             session.customer,
            plan_id:                        plan,
            subscription_status:            sub.status,
            seat_count:                     seats,
            billing_interval:               interval,
            subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('id', orgId)
        break
      }

      // ── Subscription updated (plan change, renewal, cancel scheduled) ──────
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const { data: orgs } = await supabaseAdmin
          .from('la_organizations')
          .select('id')
          .eq('stripe_subscription_id', sub.id)
          .limit(1)
        if (!orgs?.length) break

        // Detect plan from price metadata if available
        const item      = sub.items?.data?.[0]
        const priceId   = item?.price?.id
        let plan        = 'professional'
        if (priceId === PRICE_IDS.professional?.monthly) { plan = 'professional' }
        if (priceId === PRICE_IDS.professional?.annual)  { plan = 'professional' }

        await supabaseAdmin
          .from('la_organizations')
          .update({
            plan_id:                        plan,
            subscription_status:            sub.status,
            seat_count:                     item?.quantity || 1,
            subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── Subscription deleted (cancelled / expired) ────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabaseAdmin
          .from('la_organizations')
          .update({
            plan_id:               'starter',
            subscription_status:   'canceled',
            stripe_subscription_id: null,
            subscription_current_period_end: null,
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        if (!invoice.subscription) break
        await supabaseAdmin
          .from('la_organizations')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_subscription_id', invoice.subscription)
        break
      }

      // ── Payment succeeded (recovery from past_due) ────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object
        if (!invoice.subscription) break
        await supabaseAdmin
          .from('la_organizations')
          .update({ subscription_status: 'active' })
          .eq('stripe_subscription_id', invoice.subscription)
        break
      }

      default:
        break
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    // Still return 200 so Stripe doesn't retry infinitely
  }

  res.json({ received: true })
}

export default router
