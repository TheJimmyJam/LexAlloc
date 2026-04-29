-- ============================================================
-- Migration 037 — Backfill insurer_policy_period_id
--
-- la_insurer_apportionments.insurer_policy_period_id was never
-- populated during apportionment calculation. This matches each
-- row to its policy period via insurer_id + matter_id and fills
-- in the FK so future joins work correctly.
-- ============================================================

UPDATE public.la_insurer_apportionments
SET insurer_policy_period_id = ipp.id
FROM public.la_apportionments        a
JOIN public.la_insurer_policy_periods ipp
  ON ipp.insurer_id = la_insurer_apportionments.insurer_id
 AND ipp.matter_id  = a.matter_id
WHERE la_insurer_apportionments.apportionment_id         = a.id
  AND la_insurer_apportionments.insurer_policy_period_id IS NULL
  AND la_insurer_apportionments.insurer_id               IS NOT NULL;
