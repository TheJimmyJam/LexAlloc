ALTER TABLE public.la_matters
  ADD COLUMN IF NOT EXISTS default_apportionment_method text
  CHECK (default_apportionment_method IN ('pro_rata_time_on_risk', 'equal_shares', 'limits_proportional'));
