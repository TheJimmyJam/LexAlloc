-- ============================================================
-- LexAlloc Migration 003 — Payment Tracking
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.insurer_apportionments
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','demanded','paid','disputed','partially_paid')),
  ADD COLUMN IF NOT EXISTS amount_paid     numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_date    date,
  ADD COLUMN IF NOT EXISTS demanded_at     timestamptz,
  ADD COLUMN IF NOT EXISTS payment_notes   text;

CREATE INDEX IF NOT EXISTS idx_insurer_apportionments_payment_status
  ON public.insurer_apportionments(payment_status);

CREATE INDEX IF NOT EXISTS idx_insurer_apportionments_matter
  ON public.insurer_apportionments(apportionment_id);
