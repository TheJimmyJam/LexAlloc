// Edge Function: stripe-webhook
// Handles Stripe webhook events and updates obligation payment status.
//
// Register this URL in your Stripe dashboard:
//   https://fvctlmpvivewcbjkugbg.supabase.co/functions/v1/stripe-webhook
//
// Events handled:
//   checkout.session.completed  → mark obligation paid / partially paid + send receipt email

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { layout, ctaButton, infoRow } from '../_shared/emailTemplate.ts'

const STRIPE_SECRET_KEY     = Deno.env.get('STRIPE_SECRET_KEY')          ?? ''
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')      ?? ''
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')               ?? ''
const SERVICE_KEY           = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')  ?? ''
const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')             ?? ''
const RESEND_FROM           = Deno.env.get('RESEND_FROM_EMAIL')          ?? 'noreply@lexalloc.app'
const FRONTEND_URL          = Deno.env.get('FRONTEND_URL')               ?? 'https://lexalloc.netlify.app'

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
const db     = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Payment receipt email ─────────────────────────────────────────────────────

async function sendPaymentReceiptEmail(opts: {
  to:              string
  insurerName:     string
  matterName:      string
  invoiceNumber:   string
  amountPaid:      number
  paymentDate:     string
  paymentIntentId: string | null
  receiptUrl:      string | null
}) {
  const { to, insurerName, matterName, invoiceNumber, amountPaid, paymentDate, paymentIntentId, receiptUrl } = opts
  if (!RESEND_API_KEY || !to) return

  const body = `
    <p style="
      margin:0 0 20px;
      font-size:15px;
      color:#334155;
      line-height:1.7;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    ">
      Your payment has been successfully received and your obligation has been marked paid.
      Please retain this email as your official payment confirmation.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:24px;">
      ${infoRow('Insurer',      `<strong>${insurerName}</strong>`)}
      ${infoRow('Matter',       matterName)}
      ${invoiceNumber ? infoRow('Invoice', invoiceNumber) : ''}
      ${infoRow('Amount Paid',  `<strong style="color:#16a34a;font-size:15px;">$${amountPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>`)}
      ${infoRow('Payment Date', paymentDate)}
      ${paymentIntentId ? infoRow('Transaction ID', `<span style="font-family:monospace;font-size:12px;color:#475569;">${paymentIntentId}</span>`) : ''}
    </table>

    ${receiptUrl ? ctaButton('View Stripe Receipt', receiptUrl, '#0f172a') : ''}
    ${ctaButton('View Your Portal', `${FRONTEND_URL}/portal`, '#4f46e5')}
  `

  const html = layout({
    title:      'Payment Confirmation',
    badgeText:  'Paid',
    badgeColor: '#16a34a',
    body,
    footerNote: 'Questions about this payment? Contact your LexAlloc administrator.',
  })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        from:    RESEND_FROM,
        to:      [to],
        subject: `Payment Confirmation — ${invoiceNumber || matterName}`,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Resend error:', (err as any).message ?? res.status)
    }
  } catch (err: any) {
    console.error('Failed to send receipt email:', err.message)
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

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
      const session        = event.data.object as Stripe.Checkout.Session
      const obligationId   = session.metadata?.obligation_id
      const amountTotal    = session.amount_total  // cents
      const paymentIntent  = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as any)?.id ?? null
      const customerEmail  = session.customer_details?.email ?? null

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
      const paymentDate     = new Date().toISOString().split('T')[0]

      const updates: Record<string, unknown> = {
        stripe_payment_intent_id: paymentIntent,
        amount_paid:    paidCents / 100,
        payment_date:   paymentDate,
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

      // Fetch receipt URL from the charge
      let receiptUrl: string | null = null
      if (paymentIntent) {
        try {
          const pi = await stripe.paymentIntents.retrieve(paymentIntent, {
            expand: ['latest_charge'],
          })
          const charge = pi.latest_charge as Stripe.Charge | null
          receiptUrl = charge?.receipt_url ?? null
        } catch (err: any) {
          console.warn('Could not fetch receipt URL:', err.message)
        }
      }

      // Send payment receipt email
      if (customerEmail) {
        await sendPaymentReceiptEmail({
          to:              customerEmail,
          insurerName:     session.metadata?.insurer_name   ?? 'Insurer',
          matterName:      session.metadata?.matter_name    ?? 'Legal Matter',
          invoiceNumber:   session.metadata?.invoice_number ?? '',
          amountPaid:      paidCents / 100,
          paymentDate:     new Date(paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          paymentIntentId: paymentIntent,
          receiptUrl,
        })
      }
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
