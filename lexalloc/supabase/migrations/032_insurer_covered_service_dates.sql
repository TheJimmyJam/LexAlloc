ALTER TABLE public.la_insurer_policy_periods ADD COLUMN IF NOT EXISTS responsible_start date;
ALTER TABLE public.la_insurer_policy_periods ADD COLUMN IF NOT EXISTS responsible_end   date;
