-- ─────────────────────────────────────────────────────────────────────────────
-- 019_insurer_overrides.sql
-- Custom percentage overrides per insurer-apportionment row.
-- Stores the agreed/negotiated percentage alongside the system-calculated one
-- for full audit traceability.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.la_insurer_apportionments
  -- The agreed/negotiated percentage (null = no override active)
  add column override_pct      numeric(8,4),
  -- Reason / context for the override (e.g. "Agreed with carrier at policy inception")
  add column override_reason   text,
  -- Who set the override (email, denormalized for audit permanence)
  add column override_set_by   text,
  -- When the override was last set or cleared
  add column override_set_at   timestamptz;

comment on column public.la_insurer_apportionments.override_pct    is 'Negotiated/agreed percentage override. NULL = use calculated percentage.';
comment on column public.la_insurer_apportionments.override_reason  is 'Audit note explaining why the override was applied.';
comment on column public.la_insurer_apportionments.override_set_by  is 'Email of the user who applied the override.';
comment on column public.la_insurer_apportionments.override_set_at  is 'Timestamp when the override was last modified.';
