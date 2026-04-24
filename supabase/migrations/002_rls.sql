-- ============================================================
-- Row Level Security (RLS) Policies
-- Multi-tenant isolation: users only see their org's data
-- ============================================================

-- Enable RLS on all tables
alter table public.la_organizations        enable row level security;
alter table public.la_profiles             enable row level security;
alter table public.la_matters              enable row level security;
alter table public.la_parties              enable row level security;
alter table public.la_insurers             enable row level security;
alter table public.la_insurer_policy_periods enable row level security;
alter table public.la_invoices             enable row level security;
alter table public.la_invoice_line_items   enable row level security;
alter table public.la_apportionments       enable row level security;
alter table public.la_party_apportionments enable row level security;
alter table public.la_insurer_apportionments enable row level security;

-- ── Helper function: get current user's org_id ─────────────
create or replace function public.current_org_id()
returns uuid language sql stable security definer as $$
  select org_id from public.la_profiles where id = auth.uid()
$$;

-- ── Helper function: is current user an admin? ─────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists(select 1 from public.la_profiles where id = auth.uid() and role = 'admin')
$$;

-- ── organizations ─────────────────────────────────────────────
create policy "Users see their org" on public.la_organizations
  for select using (id = public.current_org_id());

create policy "Admins can insert org" on public.la_organizations
  for insert with check (true);  -- handled at app level on signup

-- ── profiles ─────────────────────────────────────────────────
create policy "Users see own org profiles" on public.la_profiles
  for select using (org_id = public.current_org_id());

create policy "Users update own profile" on public.la_profiles
  for update using (id = auth.uid());

create policy "Insert own profile" on public.la_profiles
  for insert with check (id = auth.uid());

-- ── matters ──────────────────────────────────────────────────
create policy "Matters: org isolation" on public.la_matters
  for all using (org_id = public.current_org_id());

-- ── parties ──────────────────────────────────────────────────
create policy "Parties: org isolation" on public.la_parties
  for all using (org_id = public.current_org_id());

-- ── insurers ─────────────────────────────────────────────────
create policy "Insurers: org isolation" on public.la_insurers
  for all using (org_id = public.current_org_id());

-- ── insurer_policy_periods ────────────────────────────────────
create policy "Policy periods: org isolation" on public.la_insurer_policy_periods
  for all using (org_id = public.current_org_id());

-- ── invoices ─────────────────────────────────────────────────
create policy "Invoices: org isolation" on public.la_invoices
  for all using (org_id = public.current_org_id());

-- ── invoice_line_items ───────────────────────────────────────
create policy "Line items: via invoice" on public.la_invoice_line_items
  for all using (
    invoice_id in (
      select id from public.la_invoices where org_id = public.current_org_id()
    )
  );

-- ── apportionments ───────────────────────────────────────────
create policy "Apportionments: org isolation" on public.la_apportionments
  for all using (org_id = public.current_org_id());

-- ── party_apportionments ─────────────────────────────────────
create policy "Party apportionments: via apportionment" on public.la_party_apportionments
  for all using (
    apportionment_id in (
      select id from public.la_apportionments where org_id = public.current_org_id()
    )
  );

-- ── insurer_apportionments ───────────────────────────────────
create policy "Insurer apportionments: via apportionment" on public.la_insurer_apportionments
  for all using (
    apportionment_id in (
      select id from public.la_apportionments where org_id = public.current_org_id()
    )
  );

-- ── Storage bucket ───────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → Create bucket "invoices" (public)
-- Or uncomment and run via service role:
-- insert into storage.buckets (id, name, public) values ('invoices', 'invoices', true);
