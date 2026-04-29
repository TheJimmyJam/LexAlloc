-- ============================================================
-- Migration 038 — LexAlloc Invoice Number
--
-- Adds a unique LexAlloc-generated invoice number to each
-- insurer apportionment row.
--
-- Format: [INSURER4].[FIRM4].[MATTER].[YYYYMM].[SEQ]
-- e.g.:   AJAX.HARR.BL0047.202404.001
--
-- Numbers are generated client-side on first demand letter
-- creation and stored here for permanent reference.
-- ============================================================

ALTER TABLE public.la_insurer_apportionments
  ADD COLUMN IF NOT EXISTS lexalloc_invoice_number text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ia_lexalloc_invoice_number
  ON public.la_insurer_apportionments(lexalloc_invoice_number)
  WHERE lexalloc_invoice_number IS NOT NULL;
