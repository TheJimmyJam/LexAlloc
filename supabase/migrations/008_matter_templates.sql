-- Migration 008: Matter Templates
-- Adds is_template flag to la_matters so firms can save reusable matter configurations
-- (parties, insurer assignments, share percentages) and spin up new matters from them.

ALTER TABLE public.la_matters
  ADD COLUMN IF NOT EXISTS is_template BOOLEAN NOT NULL DEFAULT false;

-- Index for fast template lookups per org
CREATE INDEX IF NOT EXISTS idx_la_matters_template
  ON public.la_matters (org_id, is_template)
  WHERE is_template = true;
