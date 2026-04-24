-- ============================================================
-- LexAlloc Migration 004 — Insurer Contact Fields
-- Adds per-matter contact info to la_insurer_policy_periods
-- and a global billing address to la_insurers
-- ============================================================

ALTER TABLE public.la_insurer_policy_periods
  ADD COLUMN IF NOT EXISTS claim_number     text,
  ADD COLUMN IF NOT EXISTS claims_rep_name  text,
  ADD COLUMN IF NOT EXISTS claims_rep_email text,
  ADD COLUMN IF NOT EXISTS billing_address  text;

ALTER TABLE public.la_insurers
  ADD COLUMN IF NOT EXISTS billing_address text;

CREATE INDEX IF NOT EXISTS idx_ipp_claim_number
  ON public.la_insurer_policy_periods(claim_number);
