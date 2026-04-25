-- Migration 030: Platform admins can SELECT all profiles across all orgs
-- Without this, platform admins were restricted by the org-scoped SELECT
-- policy and couldn't see users from other organizations.

CREATE POLICY "Platform admins see all profiles"
  ON public.la_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.la_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );
