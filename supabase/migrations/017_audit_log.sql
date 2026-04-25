-- ============================================================
-- LexAlloc Migration 017 — Matter Audit Log
-- Timestamped record of every significant action on a matter.
-- Actor identity is denormalized (email + name) so the audit
-- trail survives user deletion or role changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.la_audit_logs (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  matter_id    uuid REFERENCES public.la_matters(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES public.la_profiles(id) ON DELETE SET NULL,
  -- Denormalized actor identity for audit permanence
  user_email   text,
  user_name    text,
  -- Action key e.g. 'party.added', 'apportionment.calculated'
  action       text NOT NULL,
  -- What kind of object was affected
  entity_type  text CHECK (entity_type IN (
    'matter','party','insurer','invoice','apportionment',
    'payment','demand_letter','document','template'
  )),
  entity_id    uuid,
  entity_name  text,     -- human-readable label at time of action
  -- Arbitrary extra context: old/new values, amounts, method, etc.
  metadata     jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes for the two main access patterns:
--   1. Activity tab: all logs for a matter, newest first
--   2. Org-wide audit: all logs for an org, newest first
CREATE INDEX IF NOT EXISTS idx_audit_matter
  ON public.la_audit_logs(matter_id, created_at DESC)
  WHERE matter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_org
  ON public.la_audit_logs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_user
  ON public.la_audit_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.la_audit_logs ENABLE ROW LEVEL SECURITY;

-- All org members can read; only authenticated inserts (no delete/update)
CREATE POLICY "Audit logs: org members read"
  ON public.la_audit_logs FOR SELECT
  USING (org_id = public.current_org_id());

CREATE POLICY "Audit logs: org members insert"
  ON public.la_audit_logs FOR INSERT
  WITH CHECK (org_id = public.current_org_id());

-- No UPDATE or DELETE policies — audit logs are immutable
