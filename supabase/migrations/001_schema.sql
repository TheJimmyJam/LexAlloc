-- ============================================================
-- LexAlloc Database Schema
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Organizations (tenants) ──────────────────────────────────
create table public.organizations (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  slug       text unique,
  settings   jsonb default '{}',
  created_at timestamptz default now()
);

-- ── Profiles (extends auth.users) ───────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  role       text not null default 'user' check (role in ('admin','client','user')),
  first_name text,
  last_name  text,
  email      text,
  created_at timestamptz default now()
);

-- Auto-populate email from auth.users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Matters / Cases ──────────────────────────────────────────
create table public.matters (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid references public.organizations(id) on delete cascade not null,
  name          text not null,
  matter_number text,
  description   text,
  status        text not null default 'active' check (status in ('active','pending','closed')),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── Parties ──────────────────────────────────────────────────
create table public.parties (
  id               uuid primary key default uuid_generate_v4(),
  matter_id        uuid references public.matters(id) on delete cascade not null,
  org_id           uuid references public.organizations(id) on delete cascade not null,
  name             text not null,
  type             text default 'defendant' check (type in ('defendant','plaintiff','third_party','cross_defendant')),
  share_percentage numeric(5,2) not null default 0 check (share_percentage >= 0 and share_percentage <= 100),
  notes            text,
  created_at       timestamptz default now()
);

-- ── Insurers ─────────────────────────────────────────────────
create table public.insurers (
  id            uuid primary key default uuid_generate_v4(),
  org_id        uuid references public.organizations(id) on delete cascade not null,
  name          text not null,
  policy_number text,
  contact_email text,
  created_at    timestamptz default now()
);

-- ── Insurer Policy Periods (time-on-risk anchor) ─────────────
create table public.insurer_policy_periods (
  id           uuid primary key default uuid_generate_v4(),
  insurer_id   uuid references public.insurers(id) on delete cascade not null,
  party_id     uuid references public.parties(id) on delete cascade not null,
  matter_id    uuid references public.matters(id) on delete cascade not null,
  org_id       uuid references public.organizations(id) on delete cascade not null,
  policy_start date not null,
  policy_end   date not null,
  policy_limit numeric(15,2),
  deductible   numeric(15,2),
  created_at   timestamptz default now(),
  constraint valid_period check (policy_end >= policy_start)
);

-- ── Invoices ─────────────────────────────────────────────────
create table public.invoices (
  id             uuid primary key default uuid_generate_v4(),
  matter_id      uuid references public.matters(id) on delete cascade not null,
  org_id         uuid references public.organizations(id) on delete cascade not null,
  file_url       text,
  invoice_number text,
  invoice_date   date,
  billing_firm   text,
  total_amount   numeric(15,2) not null default 0,
  service_start  date,
  service_end    date,
  status         text not null default 'draft' check (status in ('draft','parsed','apportioned')),
  parsed_data    jsonb default '{}',
  created_at     timestamptz default now()
);

-- ── Invoice Line Items ───────────────────────────────────────
create table public.invoice_line_items (
  id              uuid primary key default uuid_generate_v4(),
  invoice_id      uuid references public.invoices(id) on delete cascade not null,
  date_of_service date,
  description     text,
  timekeeper      text,
  hours           numeric(8,2),
  rate            numeric(10,2),
  amount          numeric(15,2) not null default 0,
  category        text default 'fees' check (category in ('fees','costs','expenses','disbursements')),
  created_at      timestamptz default now()
);

-- ── Apportionments (calculation runs) ────────────────────────
create table public.apportionments (
  id                 uuid primary key default uuid_generate_v4(),
  invoice_id         uuid references public.invoices(id) on delete cascade not null,
  matter_id          uuid references public.matters(id) on delete cascade not null,
  org_id             uuid references public.organizations(id) on delete cascade not null,
  calculation_method text not null default 'pro_rata_time_on_risk',
  result_json        jsonb default '{}',
  notes              text,
  calculated_at      timestamptz default now()
);

-- ── Party Apportionments ─────────────────────────────────────
create table public.party_apportionments (
  id               uuid primary key default uuid_generate_v4(),
  apportionment_id uuid references public.apportionments(id) on delete cascade not null,
  party_id         uuid references public.parties(id) on delete set null,
  percentage       numeric(8,4) not null,
  amount           numeric(15,2) not null,
  created_at       timestamptz default now()
);

-- ── Insurer Apportionments ───────────────────────────────────
create table public.insurer_apportionments (
  id                      uuid primary key default uuid_generate_v4(),
  apportionment_id        uuid references public.apportionments(id) on delete cascade not null,
  party_apportionment_id  uuid references public.party_apportionments(id) on delete cascade,
  insurer_id              uuid references public.insurers(id) on delete set null,
  insurer_policy_period_id uuid references public.insurer_policy_periods(id) on delete set null,
  days_on_risk            integer not null default 0,
  total_days              integer not null default 0,
  percentage              numeric(8,4) not null,
  amount                  numeric(15,2) not null,
  created_at              timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index on public.matters(org_id);
create index on public.parties(matter_id);
create index on public.insurers(org_id);
create index on public.insurer_policy_periods(matter_id);
create index on public.insurer_policy_periods(party_id);
create index on public.invoices(matter_id);
create index on public.invoice_line_items(invoice_id);
create index on public.apportionments(matter_id);
create index on public.apportionments(invoice_id);
create index on public.party_apportionments(apportionment_id);
create index on public.insurer_apportionments(apportionment_id);
