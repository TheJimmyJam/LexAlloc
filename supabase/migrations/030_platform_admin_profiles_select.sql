-- Migration 030: Platform admins can SELECT all profiles across all orgs
-- Uses a SECURITY DEFINER function to avoid infinite RLS recursion
-- (a plain EXISTS subquery on la_profiles would loop back into this policy).

-- Safe helper — runs as the function owner, bypasses RLS
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.la_profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Drop the broken recursive version if it was already applied
DROP POLICY IF EXISTS "Platform admins see all profiles" ON public.la_profiles;

-- Non-recursive policy
CREATE POLICY "Platform admins see all profiles"
  ON public.la_profiles
  FOR SELECT
  USING (public.is_platform_admin());
