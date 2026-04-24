-- Migration 009: Make policy_start and policy_end nullable
-- Required for matter templates: template insurer assignments don't have
-- matter-specific dates yet — those get filled in after creating from template.

ALTER TABLE public.la_insurer_policy_periods
  ALTER COLUMN policy_start DROP NOT NULL;

ALTER TABLE public.la_insurer_policy_periods
  ALTER COLUMN policy_end DROP NOT NULL;
