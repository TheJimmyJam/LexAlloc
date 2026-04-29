-- Migration 041: store onboarding flags on the org so they persist across devices
alter table public.la_organizations
  add column if not exists onboarding_wizard_seen         boolean not null default false,
  add column if not exists onboarding_checklist_dismissed boolean not null default false;
