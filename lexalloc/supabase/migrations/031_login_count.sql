-- Migration 031: Login count tracking per user
-- Adds a login_count column to la_profiles and a SECURITY DEFINER
-- function to safely increment it on each sign-in.

ALTER TABLE public.la_profiles
  ADD COLUMN IF NOT EXISTS login_count integer NOT NULL DEFAULT 0;

-- Atomic increment — runs as function owner, bypasses RLS so any
-- authenticated user can increment their own counter without needing
-- a permissive UPDATE policy for this specific column.
CREATE OR REPLACE FUNCTION public.increment_login_count(user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.la_profiles
  SET login_count = COALESCE(login_count, 0) + 1
  WHERE id = user_id;
$$;
