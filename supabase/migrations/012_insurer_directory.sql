-- ============================================================
-- LexAlloc Migration 012 — Insurer Contact Book
-- Adds richer contact fields to la_insurers so the org-level
-- insurer directory can store default claims rep info.
-- ============================================================

ALTER TABLE public.la_insurers
  ADD COLUMN IF NOT EXISTS claims_rep_name  text,
  ADD COLUMN IF NOT EXISTS claims_rep_phone text;

-- contact_email and billing_address already exist from 001/004
-- This completes the org-level contact record: name, email,
-- billing_address, claims_rep_name, claims_rep_phone
