-- ============================================================
-- LexAlloc Migration 015 — Practice Management Connections
-- Stores credentials for Clio (matter import via existing
-- OAuth token in la_accounting_connections) and FileVine
-- (API key auth). Adds import-tracking columns to la_matters.
-- ============================================================

-- ── FileVine API key credentials ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_pm_connections (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  provider     text NOT NULL CHECK (provider IN ('filevine')),
  -- FileVine: { "api_key": "...", "fv_org_id": "12345", "fv_user_id": "67890" }
  credentials  jsonb NOT NULL DEFAULT '{}',
  connected_at timestamptz DEFAULT now(),
  connected_by uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_pm_conn_org
  ON public.la_pm_connections(org_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.la_pm_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PM connections: org isolation"
  ON public.la_pm_connections FOR ALL
  USING (org_id = public.current_org_id());

-- ── Import tracking on la_matters ────────────────────────────
-- Lets us detect duplicates and link back to source system
ALTER TABLE public.la_matters
  ADD COLUMN IF NOT EXISTS external_source text
    CHECK (external_source IN ('clio', 'filevine')),
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_matters_external
  ON public.la_matters(org_id, external_source, external_id)
  WHERE external_source IS NOT NULL;

-- ── Setup notes ───────────────────────────────────────────────
-- FileVine:
--   In FileVine Settings → API, generate an API key.
--   You also need your Org ID and User ID (visible in your
--   FileVine profile URL or API docs).
--   These are entered directly in the LexAlloc Admin → Integrations UI.
--
-- Clio:
--   Matter import reuses the existing Clio OAuth connection from
--   the accounting integration (la_accounting_connections).
--   Connect Clio in Admin → Integrations → QuickBooks & Clio first.
