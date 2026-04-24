-- Migration 005: Client Portal
-- Adds insurer_id to la_profiles so client-role users can be linked to an insurer
-- and see only their own payment obligations in the client portal.

ALTER TABLE public.la_profiles
  ADD COLUMN IF NOT EXISTS insurer_id uuid REFERENCES public.la_insurers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_insurer_id ON public.la_profiles(insurer_id);
