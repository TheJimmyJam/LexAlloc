-- Migration 010: Stripe payment tracking fields
-- Stores Stripe Checkout Session and PaymentIntent IDs on insurer obligations
-- so webhook events can be matched back to the correct obligation.

ALTER TABLE public.la_insurer_apportionments
  ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_ia_stripe_session
  ON public.la_insurer_apportionments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
