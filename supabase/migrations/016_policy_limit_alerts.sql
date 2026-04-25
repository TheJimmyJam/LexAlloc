-- ============================================================
-- LexAlloc Migration 016 — Policy Limit Exhaustion Alerts
-- Tracks which threshold (80/95/100%) has been alerted per
-- insurer policy period so we never double-notify.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.la_policy_limit_alerts (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  matter_id         uuid REFERENCES public.la_matters(id) ON DELETE CASCADE NOT NULL,
  insurer_id        uuid REFERENCES public.la_insurers(id) ON DELETE SET NULL,
  policy_period_id  uuid REFERENCES public.la_insurer_policy_periods(id) ON DELETE CASCADE NOT NULL,
  -- 80 = Warning, 95 = Near Limit, 100 = Exhausted
  threshold         integer NOT NULL CHECK (threshold IN (80, 95, 100)),
  alerted_at        timestamptz NOT NULL DEFAULT now(),
  -- Snapshot values at time of alert (for audit trail)
  cumulative_amount numeric(15,2),   -- total obligated when alert fired
  policy_limit      numeric(15,2),
  pct_exhausted     numeric(6,2),
  -- One alert per threshold per policy period — can be deleted to re-arm
  UNIQUE (policy_period_id, threshold)
);

CREATE INDEX IF NOT EXISTS idx_pla_matter
  ON public.la_policy_limit_alerts(matter_id);

CREATE INDEX IF NOT EXISTS idx_pla_period
  ON public.la_policy_limit_alerts(policy_period_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.la_policy_limit_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Policy limit alerts: org isolation"
  ON public.la_policy_limit_alerts FOR ALL
  USING (org_id = public.current_org_id());

-- ── Setup notes ───────────────────────────────────────────────
-- The check-policy-limits edge function can be:
--   1. Triggered automatically via pg_cron (daily batch) — see below
--   2. Triggered on-demand from the Insurers tab in MatterDetail
--
-- To schedule a daily check at 7:00 AM UTC with pg_cron:
--
-- SELECT cron.schedule(
--   'check-policy-limits-daily',
--   '0 7 * * *',
--   $$
--     SELECT net.http_post(
--       url := current_setting('app.supabase_url') || '/functions/v1/check-policy-limits',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--       ),
--       body := '{}'::jsonb
--     );
--   $$
-- );
