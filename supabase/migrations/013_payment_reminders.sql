-- ============================================================
-- LexAlloc Migration 013 — Payment Reminders
-- Tracks automated and manual reminder emails sent to insurers
-- for outstanding demands at 30, 60, and 90 day thresholds.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.la_payment_reminders (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  insurer_apportionment_id uuid REFERENCES public.la_insurer_apportionments(id) ON DELETE CASCADE NOT NULL,
  org_id                   uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  days_threshold           integer NOT NULL,          -- 30, 60, 90 (or 0 for manual)
  email_to                 text,                      -- insurer claims rep email
  sent_at                  timestamptz DEFAULT now(),
  triggered_by             text DEFAULT 'auto' CHECK (triggered_by IN ('auto', 'manual')),
  status                   text DEFAULT 'sent'  CHECK (status IN ('sent', 'failed')),
  error_message            text
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_ia
  ON public.la_payment_reminders(insurer_apportionment_id);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_org
  ON public.la_payment_reminders(org_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.la_payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment reminders: org isolation"
  ON public.la_payment_reminders FOR ALL
  USING (org_id = public.current_org_id());

-- ── pg_cron scheduling (run in Supabase SQL editor after enabling pg_cron) ───
-- This fires the edge function daily at 8 AM UTC.
-- Replace YOUR_PROJECT_REF and SERVICE_ROLE_KEY before running.
--
-- SELECT cron.schedule(
--   'lexalloc-payment-reminders',
--   '0 8 * * *',   -- daily at 08:00 UTC
--   $$
--   SELECT net.http_post(
--     url      := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-payment-reminders',
--     headers  := '{"Content-Type":"application/json","Authorization":"Bearer SERVICE_ROLE_KEY"}'::jsonb,
--     body     := '{}'::jsonb
--   );
--   $$
-- );
