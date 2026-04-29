-- Migration 040: Richer insurer profiles + standalone claims reps

-- ── Enrich la_insurers ───────────────────────────────────────────────────────
ALTER TABLE public.la_insurers
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS website            text,
  ADD COLUMN IF NOT EXISTS payment_portal_url text,
  ADD COLUMN IF NOT EXISTS address_line1      text,
  ADD COLUMN IF NOT EXISTS address_line2      text,
  ADD COLUMN IF NOT EXISTS city               text,
  ADD COLUMN IF NOT EXISTS state              text,
  ADD COLUMN IF NOT EXISTS zip                text,
  ADD COLUMN IF NOT EXISTS notes              text;

-- ── Claims reps as a first-class record ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_insurer_claims_reps (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  insurer_id  uuid REFERENCES public.la_insurers(id)      ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  email       text,
  phone       text,
  title       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icr_insurer ON public.la_insurer_claims_reps(insurer_id);
CREATE INDEX IF NOT EXISTS idx_icr_org     ON public.la_insurer_claims_reps(org_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.la_insurer_claims_reps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage claims reps"
  ON public.la_insurer_claims_reps
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.la_profiles WHERE id = auth.uid()
    )
  );
