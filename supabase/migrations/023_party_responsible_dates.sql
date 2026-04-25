-- Migration 023: Add responsible date range to la_parties
-- These columns define the period a party is responsible for invoiced costs.
-- When running apportionment, only parties whose range overlaps the invoice
-- service period are included. NULL means open-ended (no restriction).

ALTER TABLE la_parties
  ADD COLUMN IF NOT EXISTS responsible_start DATE,
  ADD COLUMN IF NOT EXISTS responsible_end   DATE;

COMMENT ON COLUMN la_parties.responsible_start IS
  'First date this party is responsible for costs. NULL = no start restriction.';

COMMENT ON COLUMN la_parties.responsible_end IS
  'Last date this party is responsible for costs. NULL = no end restriction.';
