-- Migration 035: Add date_range_override flag to la_insurer_policy_periods
--
-- When an insurer's dates-of-service-responsible are broader than the parent
-- party's responsible dates, the UI blocks saving. An admin can override this
-- restriction; the override is persisted here so the flag doesn't re-trigger.

ALTER TABLE la_insurer_policy_periods
  ADD COLUMN IF NOT EXISTS date_range_override boolean DEFAULT false;

COMMENT ON COLUMN la_insurer_policy_periods.date_range_override IS
  'Admin-set override: allows insurer responsible dates that are broader than the party responsible date range.';
