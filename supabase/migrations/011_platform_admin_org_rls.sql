-- Migration 011: Allow platform admins to see, update, and delete all organizations
-- Bug: Platform admins could INSERT new orgs but the existing SELECT policy
-- (id = current_org_id()) prevented them from seeing any org other than their own,
-- so newly created orgs appeared to vanish after creation.

-- SELECT: platform admins can see all orgs
CREATE POLICY "Platform admins see all orgs"
  ON public.la_organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.la_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- UPDATE: platform admins can update any org
CREATE POLICY "Platform admins update orgs"
  ON public.la_organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.la_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- DELETE: platform admins can delete any org
CREATE POLICY "Platform admins delete orgs"
  ON public.la_organizations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.la_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );
