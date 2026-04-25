-- ─────────────────────────────────────────────────────────────────────────────
-- 018_matter_notes.sql
-- Per-matter notes/comments thread: team members can leave context, flag
-- issues, log calls, or pin important notes to the matter.
-- ─────────────────────────────────────────────────────────────────────────────

create type la_note_type as enum ('note', 'flag', 'call_log', 'issue');

create table public.la_matter_notes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.la_organizations(id) on delete cascade,
  matter_id     uuid not null references public.la_matters(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_name     text not null,
  user_email    text not null,
  content       text not null check (char_length(content) > 0),
  note_type     la_note_type not null default 'note',
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes
create index la_matter_notes_matter_id_idx on public.la_matter_notes (matter_id, created_at desc);
create index la_matter_notes_org_id_idx    on public.la_matter_notes (org_id, created_at desc);
create index la_matter_notes_pinned_idx    on public.la_matter_notes (matter_id, is_pinned) where is_pinned = true;

-- updated_at trigger
create or replace function public.la_matter_notes_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger la_matter_notes_updated_at
  before update on public.la_matter_notes
  for each row execute function public.la_matter_notes_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.la_matter_notes enable row level security;

-- Any org member can read notes on their matters
create policy "org members can read matter notes"
  on public.la_matter_notes for select
  using (
    org_id in (
      select org_id from public.la_profiles where id = auth.uid()
    )
  );

-- Any org member can post a note
create policy "org members can insert matter notes"
  on public.la_matter_notes for insert
  with check (
    org_id in (
      select org_id from public.la_profiles where id = auth.uid()
    )
    and user_id = auth.uid()
  );

-- Author can edit their own note (content, note_type, is_pinned)
create policy "authors can update own notes"
  on public.la_matter_notes for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Author can delete their own note; org admins can also delete
create policy "authors and admins can delete notes"
  on public.la_matter_notes for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.la_profiles
      where id = auth.uid()
        and org_id = la_matter_notes.org_id
        and role = 'admin'
    )
  );
