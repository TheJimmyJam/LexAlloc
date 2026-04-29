-- ============================================================
-- Migration 037 — Backfill insurer_policy_period_id
--
-- la_insurer_apportionments.insurer_policy_period_id was never
-- populated during apportionment calculation. This matches each
-- row to its policy period via insurer_id + matter_id and fills
-- in the FK so future joins work correctly.
-- ============================================================

UPDATE public.la_insurer_apportionments
SET insurer_policy_period_id = sub.ipp_id
FROM (
  SELECT
    ia.id    AS ia_id,
    ipp.id   AS ipp_id
  FROM public.la_insurer_apportionments  ia
  JOIN public.la_apportionments           a   ON a.id         = ia.apportionment_id
  JOIN public.la_insurer_policy_periods   ipp ON ipp.insurer_id = ia.insurer_id
                                             AND ipp.matter_id  = a.matter_id
  WHERE ia.insurer_policy_period_id IS NULL
    AND ia.insurer_id               IS NOT NULL
) sub
WHERE public.la_insurer_apportionments.id = sub.ia_id;
