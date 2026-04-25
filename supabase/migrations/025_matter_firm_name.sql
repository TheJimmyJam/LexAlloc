-- Migration 025: add firm_name to la_matters
alter table public.la_matters
  add column if not exists firm_name text;
