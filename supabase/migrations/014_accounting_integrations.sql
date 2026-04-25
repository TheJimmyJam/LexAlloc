-- ============================================================
-- LexAlloc Migration 014 — Accounting Integrations
-- Stores OAuth connections and push history for QuickBooks
-- Online and Clio integrations.
-- ============================================================

-- ── OAuth connections (one row per org per provider) ─────────
CREATE TABLE IF NOT EXISTS public.la_accounting_connections (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  provider      text NOT NULL CHECK (provider IN ('quickbooks', 'clio')),
  realm_id      text,             -- QBO company ID  / Clio account ID
  access_token  text,             -- current access token
  refresh_token text,             -- long-lived refresh token
  token_expiry  timestamptz,      -- when access token expires
  -- Provider-specific settings (editable post-connect)
  -- QBO:  { "deposit_account_id": "35", "income_account_id": "79" }
  -- Clio: { "default_matter_id": null }
  settings      jsonb NOT NULL DEFAULT '{}',
  connected_at  timestamptz DEFAULT now(),
  connected_by  uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_acct_conn_org
  ON public.la_accounting_connections(org_id);

-- ── Push log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_accounting_pushes (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  insurer_apportionment_id uuid REFERENCES public.la_insurer_apportionments(id) ON DELETE CASCADE NOT NULL,
  org_id                   uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE,
  provider                 text NOT NULL,
  external_id              text,    -- QBO transaction ID / Clio activity ID
  pushed_at                timestamptz DEFAULT now(),
  status                   text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'failed')),
  amount                   numeric(15,2),
  error_message            text
);

CREATE INDEX IF NOT EXISTS idx_acct_push_ia
  ON public.la_accounting_pushes(insurer_apportionment_id);

CREATE INDEX IF NOT EXISTS idx_acct_push_org
  ON public.la_accounting_pushes(org_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.la_accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.la_accounting_pushes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accounting connections: org isolation"
  ON public.la_accounting_connections FOR ALL
  USING (org_id = public.current_org_id());

CREATE POLICY "Accounting pushes: org isolation"
  ON public.la_accounting_pushes FOR ALL
  USING (org_id = public.current_org_id());

-- ── Setup notes ───────────────────────────────────────────────
-- Required Supabase secrets (set in Dashboard → Edge Functions → Secrets):
--
--   QBO_CLIENT_ID        — from Intuit Developer portal
--   QBO_CLIENT_SECRET    — from Intuit Developer portal
--   QBO_REDIRECT_URI     — https://{PROJECT}.supabase.co/functions/v1/accounting-oauth-callback
--   QBO_ENVIRONMENT      — 'sandbox' or 'production'
--
--   CLIO_CLIENT_ID       — from Clio Developer portal
--   CLIO_CLIENT_SECRET   — from Clio Developer portal
--   CLIO_REDIRECT_URI    — https://{PROJECT}.supabase.co/functions/v1/accounting-oauth-callback
--
--   FRONTEND_URL         — https://lexalloc.netlify.app (already set)
--   SUPABASE_URL         — already set
--   SUPABASE_SERVICE_ROLE_KEY — already set
