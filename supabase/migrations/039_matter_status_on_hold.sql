-- Migration 039: add on_hold to la_matters status, migrate pending → on_hold
-- Drop old check constraint and add updated one

ALTER TABLE la_matters
  DROP CONSTRAINT IF EXISTS la_matters_status_check;

ALTER TABLE la_matters
  ADD CONSTRAINT la_matters_status_check
    CHECK (status IN ('active', 'on_hold', 'closed', 'pending'));

-- Migrate any existing 'pending' matter rows to 'on_hold'
UPDATE la_matters SET status = 'on_hold' WHERE status = 'pending';
