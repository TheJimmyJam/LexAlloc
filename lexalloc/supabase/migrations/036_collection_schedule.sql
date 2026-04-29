-- Migration 036: Collection reminder scheduling
--
-- Adds schedule_type to la_payment_reminders so the new monthly / bi-weekly /
-- weekly collection emails are tracked separately from the old threshold alerts.
-- Also wires up pg_cron to call send-collection-reminders daily at 8 AM UTC.

ALTER TABLE public.la_payment_reminders
  ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'threshold'
    CHECK (schedule_type IN ('threshold','monthly','biweekly','weekly'));

COMMENT ON COLUMN public.la_payment_reminders.schedule_type IS
  'threshold = old 30/60/90-day alerts; monthly/biweekly/weekly = collection schedule';

-- ── pg_cron daily trigger ────────────────────────────────────────────────────
-- Requires pg_cron + pg_net extensions (enabled in Supabase Pro/Team).
-- Run this block once in the Supabase SQL editor if pg_cron is available:
--
-- SELECT cron.schedule(
--   'lexalloc-collection-reminders',
--   '0 8 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://fvctlmpvivewcbjkugbg.supabase.co/functions/v1/send-collection-reminders',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
--                ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
