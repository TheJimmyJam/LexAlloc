-- ============================================================
-- LexAlloc Migration 029 — Settlement & Reserve Tracking
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Top-level settlement record per matter ─────────────────
CREATE TABLE IF NOT EXISTS public.la_settlements (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id        uuid REFERENCES public.la_matters(id) ON DELETE CASCADE NOT NULL,
  org_id           uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  settlement_date  date NOT NULL,
  total_amount     numeric(15,2) NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'final')),
  notes            text,
  created_by       uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ── Per-insurer allocation within a settlement ─────────────
CREATE TABLE IF NOT EXISTS public.la_settlement_allocations (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id            uuid REFERENCES public.la_settlements(id) ON DELETE CASCADE NOT NULL,
  insurer_id               uuid REFERENCES public.la_insurers(id) ON DELETE SET NULL,
  insurer_policy_period_id uuid REFERENCES public.la_insurer_policy_periods(id) ON DELETE SET NULL,
  party_id                 uuid REFERENCES public.la_parties(id) ON DELETE SET NULL,
  original_demand          numeric(15,2) NOT NULL DEFAULT 0,
  reserve_amount           numeric(15,2) NOT NULL DEFAULT 0,
  settlement_amount        numeric(15,2) NOT NULL DEFAULT 0,
  notes                    text,
  created_at               timestamptz DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_settlements_matter ON public.la_settlements(matter_id);
CREATE INDEX IF NOT EXISTS idx_settlements_org    ON public.la_settlements(org_id);
CREATE INDEX IF NOT EXISTS idx_settlement_allocs  ON public.la_settlement_allocations(settlement_id);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.la_settlements           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.la_settlement_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settlements" ON public.la_settlements
  FOR ALL USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

CREATE POLICY "org_settlement_allocations" ON public.la_settlement_allocations
  FOR ALL USING (
    settlement_id IN (
      SELECT id FROM public.la_settlements
      WHERE org_id = public.current_org_id()
    )
  )
  WITH CHECK (
    settlement_id IN (
      SELECT id FROM public.la_settlements
      WHERE org_id = public.current_org_id()
    )
  );
