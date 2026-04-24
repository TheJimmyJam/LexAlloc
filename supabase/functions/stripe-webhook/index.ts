// Edge Function: stripe-webhook
// Handles Stripe webhook events and updates obligation payment status.
//
// Register this URL in your Stripe dashboard:
//   https://fvctlmpvivewcbjkugbg.supabase.co/functions/v1/stripe-webhook
//
// Events handled:
//   checkout.session.completed  → mark obligation paid / partially paid

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const STRIPE_SECRET_KEY      = Deno.env.get('STRIPE_SECRET_KEY')       ?? ''
const STRIPE_WEBHOOK_SECRET  = Deno.env.get('STRIPE_WEBHOOK_SECRET')   ?? ''
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')            ?? ''
const SERVICE_KEY             = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
const db     = createClient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'stripe-signature, content-type' },
    })
  }

  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session       = event.data.object as Stripe.Checkout.Session
      const obligationId  = session.metadata?.obligation_id
      const amountTotal   = session.amount_total  // cents
      const paymentIntent = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null

      if (!obligationId) {
        console.warn('No obligation_id in session metadata', session.id)
        return new Response('ok', { status: 200 })
      }

      // Fetch current obligation to determine full amount
      const { data: ia } = await db
        .from('la_insurer_apportionments')
        .select('id, amount')
        .eq('id', obligationId)
        .single()

      const fullAmountCents = Math.round((ia?.amount ?? 0) * 100)
      const paidCents       = amountTotal ?? 0
      const isFullyPaid     = paidCents >= fullAmountCents

      const updates: Record<string, unknown> = {
        stripe_payment_intent_id: paymentIntent,
        amount_paid:   paidCents / 100,
        payment_date:  new Date().toISOString().split('T')[0],
        payment_status: isFullyPaid ? 'paid' : 'partially_paid',
      }

      const { error } = await db
        .from('la_insurer_apportionments')
        .update(updates)
        .eq('id', obligationId)

      if (error) {
        console.error('Failed to update obligation:', error)
        return new Response('DB update failed', { status: 500 })
      }

      console.log(`Obligation ${obligationId} marked ${updates.payment_status} ($${paidCents / 100})`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Webhook handler error:', err)
    return new Response(`Handler error: ${err.message}`, { status: 500 })
  }
})
