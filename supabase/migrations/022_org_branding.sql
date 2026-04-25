-- ─────────────────────────────────────────────────────────────────────────────
-- 022_org_branding.sql
-- Per-org white-label branding: custom domain, logo, colors, firm name.
-- A public view exposes only safe branding fields so the login page can
-- detect and apply an org's brand before the user authenticates.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.la_organizations
  add column brand_name          text,           -- e.g. "BigLaw LLP Apportionment"
  add column brand_logo_url      text,           -- full URL to logo image
  add column brand_favicon_url   text,           -- full URL to favicon
  add column brand_primary_color text            -- hex color e.g. "#1e40af"
    check (brand_primary_color is null or brand_primary_color ~ '^#[0-9a-fA-F]{6}$'),
  add column brand_support_email text,           -- shown on login/error pages
  add column custom_domain       text unique;    -- e.g. "apportionment.biglaw.com"

create index la_organizations_custom_domain_idx
  on public.la_organizations (custom_domain)
  where custom_domain is not null;

-- ── Public branding view (safe for anon key) ─────────────────────────────────
-- Only exposes fields needed to brand the login page and shell.
-- No org settings, no user data, no billing info.
create or replace view public.la_org_branding_public as
  select
    id                   as org_id,
    name                 as org_name,
    custom_domain,
    brand_name,
    brand_logo_url,
    brand_favicon_url,
    brand_primary_color,
    brand_support_email
  from public.la_organizations
  where custom_domain is not null;

-- Allow the anon role to read this view (no RLS needed — it's already filtered)
grant select on public.la_org_branding_public to anon, authenticated;

comment on column public.la_organizations.brand_name          is 'White-label display name shown in place of LexAlloc';
comment on column public.la_organizations.brand_logo_url      is 'URL to org logo — replaces LexAlloc logo in sidebar and login';
comment on column public.la_organizations.brand_primary_color is 'Hex color overriding LexAlloc brand palette at runtime';
comment on column public.la_organizations.custom_domain       is 'Custom domain for white-label deployment e.g. apportionment.biglaw.com';
