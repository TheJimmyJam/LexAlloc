-- Create law firms table
CREATE TABLE IF NOT EXISTS public.la_firms (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid references public.la_organizations(id) on delete cascade not null,
  name       text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
ALTER TABLE public.la_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Firms: org isolation" ON public.la_firms
  FOR ALL USING (org_id = public.current_org_id());

-- Add firm_id FK to matters
ALTER TABLE public.la_matters ADD COLUMN IF NOT EXISTS firm_id uuid references public.la_firms(id) on delete set null;
