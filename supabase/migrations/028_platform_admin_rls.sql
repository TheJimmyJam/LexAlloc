-- Migration 028: Allow platform admins to update any profile
-- Without this, DB Admins were silently blocked from granting/revoking
-- DB Admin status on other users (RLS only allowed self-updates).

create policy "Platform admins can update any profile"
  on public.la_profiles
  for update
  using (
    (select is_platform_admin from public.la_profiles where id = auth.uid())
  );
