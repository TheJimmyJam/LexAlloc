-- Migration 007: Platform Admin (DB Admin) flag
-- Distinguishes platform-level super-admins from org-level admins.
-- Platform admins can see and manage all orgs and users across the system.

ALTER TABLE public.la_profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

-- Index for fast lookup (e.g. bootstrap check: "are there any platform admins?")
CREATE INDEX IF NOT EXISTS idx_la_profiles_platform_admin
  ON public.la_profiles (is_platform_admin)
  WHERE is_platform_admin = true;

-- Note: set the initial platform admin manually after running this migration:
--   UPDATE public.la_profiles SET is_platform_admin = true WHERE email = 'wcannon83@gmail.com';
-- Or use the "Claim DB Admin" button in Admin > Users (visible when no platform admins exist).
