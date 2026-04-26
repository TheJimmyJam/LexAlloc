// Edge Function: create-checkout-session
// Creates a Stripe Checkout Session for a given insurer obligation and
// stores the session ID on the obligation row.
//
// POST body: { obligation_id }
// Returns:   { url: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const FRONTEND_URL      = Deno.env.get('FRONTEND_URL')      ?? 'https://lexalloc.netlify.app'
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10', httpClient: Stripe.createFetchHttpClient() })
const db     = createClient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    })
  }

  try {
    // Get the calling user's email from their JWT so we can pre-fill it in Stripe
    let customerEmail: string | undefined
    const authHeader = req.headers.get('authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (jwt) {
      const userClient = createClient(SUPABASE_URL, SERVICE_KEY)
      const { data: { user } } = await userClient.auth.getUser(jwt)
      customerEmail = user?.email ?? undefined
    }

    const { obligation_id } = await req.json()
    if (!obligation_id) {
      return json({ error: 'obligation_id is required' }, 400)
    }

    // Fetch the obligation with matter + invoice + insurer context
    // Also pull org_id from la_matters so we can notify admins via webhook
    const { data: ia, error: iaErr } = await db
      .from('la_insurer_apportionments')
      .select(`
        id, amount, amount_paid, payment_status,
        insurer_apportionment_id:id,
        insurers:la_insurers(name),
        party_apportionment:la_party_apportionments(
          apportionment:la_apportionments(
            matter_id,
            matters:la_matters(name, org_id),
            invoices:la_invoices(invoice_number)
          )
        )
      `)
      .eq('id', obligation_id)
      .single()

    if (iaErr || !ia) return json({ error: 'Obligation not found' }, 404)
    if (ia.payment_status === 'paid') return json({ error: 'This obligation has already been paid' }, 400)

    const apportionment = ia.party_apportionment?.apportionment
    const matterName    = apportionment?.matters?.name    ?? 'Legal Matter'
    const invoiceNumber = apportionment?.invoices?.invoice_number ?? ''
    const insurerName   = ia.insurers?.name ?? 'Insurer'
    const matterId      = apportionment?.matter_id ?? ''
    const orgId         = apportionment?.matters?.org_id ?? ''

    // Amount already paid (partial), so charge the remainder
    const amountOwed    = Math.round((ia.amount ?? 0) * 100)           // cents
    const amountPaid    = Math.round((ia.amount_paid ?? 0) * 100)      // cents
    const amountDue     = Math.max(amountOwed - amountPaid, 0)

    if (amountDue === 0) return json({ error: 'No outstanding balance' }, 400)

    const description = [
      `Defense cost apportionment`,
      invoiceNumber ? `Invoice #${invoiceNumber}` : null,
      `Matter: ${matterName}`,
    ].filter(Boolean).join(' · ')

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode:        'payment',
      currency:    'usd',
      // Pre-fill client's email so the receipt goes to the right address
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      line_items: [{
        quantity: 1,
        price_data: {
          currency:     'usd',
          unit_amount:  amountDue,
          product_data: {
            name:        `${insurerName} — Defense Cost Payment`,
            description: description,
          },
        },
      }],
      payment_method_types: ['card', 'us_bank_account'],
      metadata: {
        obligation_id:  obligation_id,
        org_id:         orgId,       // needed by webhook to notify org admins
        matter_id:      matterId,
        matter_name:    matterName,
        insurer_name:   insurerName,
        invoice_number: invoiceNumber,
      },
      success_url: `${FRONTEND_URL}/portal?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND_URL}/portal?payment=cancelled`,
    })

    // Store session ID on the obligation so the webhook can match it back
    await db
      .from('la_insurer_apportionments')
      .update({ stripe_session_id: session.id })
      .eq('id', obligation_id)

    return json({ url: session.url })
  } catch (err: any) {
    console.error('create-checkout-session error:', err)
    return json({ error: err.message ?? 'Internal error' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
