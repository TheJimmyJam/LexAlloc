-- Migration 024: Drop type column from la_parties
-- Party type (plaintiff/defendant/etc) is not used — all parties are treated identically.

ALTER TABLE la_parties DROP COLUMN IF EXISTS type;
