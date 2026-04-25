-- ─────────────────────────────────────────────────────────────────────────────
-- 021_api_keys.sql
-- Per-org API keys for programmatic access to LexAlloc data.
-- Keys are hashed (SHA-256) — the plaintext is shown once on creation and
-- never stored.  key_prefix stores the first 12 chars for display/identification.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.la_api_keys (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.la_organizations(id) on delete cascade,

  -- Human-readable label (e.g. "DMS Integration", "Reporting Dashboard")
  name             text not null check (char_length(name) > 0),

  -- SHA-256 hex digest of the full key — used for lookup on every request
  key_hash         text not null unique,

  -- First 12 characters of the key displayed in the UI (e.g. "lx_live_a1b2")
  key_prefix       text not null,

  -- Granted permissions: array of strings e.g. ["read", "write:invoices"]
  scopes           text[] not null default '{read}',

  -- Lifecycle
  is_active        boolean not null default true,
  last_used_at     timestamptz,
  expires_at       timestamptz,   -- null = never expires
  created_by_email text not null,
  created_at       timestamptz not null default now()
);

-- Fast lookup on every API request
create index la_api_keys_hash_idx    on public.la_api_keys (key_hash) where is_active = true;
create index la_api_keys_org_id_idx  on public.la_api_keys (org_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.la_api_keys enable row level security;

-- Org admins can manage their own org's keys
create policy "org admins can manage api keys"
  on public.la_api_keys
  using (
    org_id in (
      select org_id from public.la_profiles
      where id = auth.uid() and role in ('admin', 'owner')
    )
  );

comment on table  public.la_api_keys            is 'API keys for programmatic access. Plaintext never stored — only SHA-256 hash.';
comment on column public.la_api_keys.key_hash   is 'SHA-256 hex digest of the bearer token.';
comment on column public.la_api_keys.key_prefix is 'First 12 chars of the key, shown in UI for identification.';
comment on column public.la_api_keys.scopes     is 'Granted scopes: read | write | write:invoices';
