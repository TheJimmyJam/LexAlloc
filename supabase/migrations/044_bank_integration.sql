-- ============================================================
-- LexAlloc Migration 044 — Bank Integration (provider-agnostic)
--
-- Lays the schema for connecting a bank (Mercury first, Plaid as
-- fallback for everything else, with manual entry as a third path)
-- and reconciling incoming wires/ACH credits to apportionment rows.
--
-- Tables:
--   la_bank_connections — one row per (org × provider). Holds the
--      access token and webhook secret. Enabled flag so connections
--      can be paused without deleting them.
--   la_bank_accounts    — accounts visible under a connection. Each
--      may optionally be tied to a la_matters row when a firm wants
--      one sub-account per matter (Mercury Treasury feature).
--   la_bank_transactions — every credit/debit fetched from the bank.
--      Has matched_apportionment_id (nullable FK) and a confidence
--      score so partial/fuzzy matches can sit in a "needs review"
--      state until a human confirms.
--
-- Plus: la_matters.bank_account_id — convenience FK so matter-detail
--   pages can show wire instructions for the right sub-account.
--
-- All tables RLS-gated by org_id via current_org_id().
-- ============================================================


-- ── Enums ─────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE la_bank_provider AS ENUM ('mercury', 'plaid', 'relay', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE la_bank_connection_status AS ENUM ('connected', 'disconnected', 'error', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE la_txn_direction AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE la_txn_match_method AS ENUM ('exact_memo', 'amount_insurer_date', 'amount_date', 'amount_insurer_fuzzy', 'manual', 'unmatched');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── la_bank_connections ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_bank_connections (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id                uuid NOT NULL REFERENCES public.la_organizations(id) ON DELETE CASCADE,
  provider              la_bank_provider NOT NULL,
  status                la_bank_connection_status NOT NULL DEFAULT 'pending',
  -- Encrypted at the application layer before insert; we never store cleartext.
  access_token_encrypted text,
  refresh_token_encrypted text,
  webhook_secret_encrypted text,
  -- Provider-specific identifiers (e.g. Mercury organization id).
  external_org_id       text,
  external_org_name     text,
  -- Optional override for which org-account the firm uses for collections.
  default_account_id    uuid,                       -- FK added below after la_bank_accounts exists
  enabled               boolean NOT NULL DEFAULT true,
  last_sync_at          timestamptz,
  last_sync_error       text,
  connected_at          timestamptz NOT NULL DEFAULT now(),
  connected_by          uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- Only one connection per provider per org.
  UNIQUE (org_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_org      ON public.la_bank_connections(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_connections_provider ON public.la_bank_connections(provider);


-- ── la_bank_accounts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_bank_accounts (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id         uuid NOT NULL REFERENCES public.la_bank_connections(id) ON DELETE CASCADE,
  org_id                uuid NOT NULL REFERENCES public.la_organizations(id)    ON DELETE CASCADE,
  -- Optional: when an org runs sub-account-per-matter (Mercury Treasury).
  matter_id             uuid REFERENCES public.la_matters(id) ON DELETE SET NULL,
  -- Provider-side id (Mercury account id, Plaid account_id, etc.).
  external_id           text NOT NULL,
  account_name          text NOT NULL,
  account_type          text,                       -- 'checking' | 'savings' | etc.
  -- We never store full account/routing numbers in the clear; last4 is enough
  -- to display in the UI for wire instructions.
  account_number_last4  text,
  routing_number        text,                       -- routing alone isn't sensitive
  currency              text NOT NULL DEFAULT 'USD',
  balance_cents         bigint,
  balance_at            timestamptz,
  is_archived           boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_org        ON public.la_bank_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection ON public.la_bank_accounts(connection_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_matter     ON public.la_bank_accounts(matter_id) WHERE matter_id IS NOT NULL;


-- Wire up the deferred FK on la_bank_connections.default_account_id now that
-- la_bank_accounts exists. ON DELETE SET NULL so deleting the account doesn't
-- nuke the connection.
ALTER TABLE public.la_bank_connections
  ADD CONSTRAINT la_bank_connections_default_account_fk
  FOREIGN KEY (default_account_id)
  REFERENCES public.la_bank_accounts(id)
  ON DELETE SET NULL;


-- Convenience FK on la_matters so the matter page can render wire info.
ALTER TABLE public.la_matters
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.la_bank_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matters_bank_account ON public.la_matters(bank_account_id) WHERE bank_account_id IS NOT NULL;


-- ── la_bank_transactions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_bank_transactions (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id                  uuid NOT NULL REFERENCES public.la_bank_accounts(id) ON DELETE CASCADE,
  org_id                      uuid NOT NULL REFERENCES public.la_organizations(id) ON DELETE CASCADE,
  external_id                 text NOT NULL,        -- provider's transaction id
  posted_at                   timestamptz NOT NULL,
  amount_cents                bigint  NOT NULL,     -- always positive; direction tells signed-ness
  direction                   la_txn_direction NOT NULL,
  currency                    text    NOT NULL DEFAULT 'USD',
  description                 text,                 -- short summary the bank shows
  counterparty_name           text,                 -- "Travelers Indemnity Co" etc.
  raw_memo                    text,                 -- full memo / description line
  raw_payload                 jsonb,                -- full provider payload for debugging
  -- Reconciliation
  matched_apportionment_id    uuid REFERENCES public.la_insurer_apportionments(id) ON DELETE SET NULL,
  match_method                la_txn_match_method NOT NULL DEFAULT 'unmatched',
  match_confidence            int CHECK (match_confidence BETWEEN 0 AND 100),
  match_reviewed_at           timestamptz,
  match_reviewed_by           uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  match_notes                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_txns_org         ON public.la_bank_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_bank_txns_account     ON public.la_bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_txns_posted_at   ON public.la_bank_transactions(posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bank_txns_matched     ON public.la_bank_transactions(matched_apportionment_id) WHERE matched_apportionment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_txns_unmatched   ON public.la_bank_transactions(org_id, posted_at DESC) WHERE matched_apportionment_id IS NULL AND direction = 'credit';


-- ── updated_at triggers ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.la_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS la_bank_connections_set_updated_at ON public.la_bank_connections;
CREATE TRIGGER la_bank_connections_set_updated_at
  BEFORE UPDATE ON public.la_bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.la_set_updated_at();

DROP TRIGGER IF EXISTS la_bank_accounts_set_updated_at ON public.la_bank_accounts;
CREATE TRIGGER la_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.la_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.la_set_updated_at();

DROP TRIGGER IF EXISTS la_bank_transactions_set_updated_at ON public.la_bank_transactions;
CREATE TRIGGER la_bank_transactions_set_updated_at
  BEFORE UPDATE ON public.la_bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.la_set_updated_at();


-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE public.la_bank_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.la_bank_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.la_bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank connections: org isolation" ON public.la_bank_connections;
CREATE POLICY "bank connections: org isolation"
  ON public.la_bank_connections FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "bank accounts: org isolation" ON public.la_bank_accounts;
CREATE POLICY "bank accounts: org isolation"
  ON public.la_bank_accounts FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());

DROP POLICY IF EXISTS "bank transactions: org isolation" ON public.la_bank_transactions;
CREATE POLICY "bank transactions: org isolation"
  ON public.la_bank_transactions FOR ALL
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());


-- ── Grants ────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.la_bank_connections  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.la_bank_accounts     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.la_bank_transactions TO authenticated;
