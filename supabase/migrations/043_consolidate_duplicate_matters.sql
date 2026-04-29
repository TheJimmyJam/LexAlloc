-- ============================================================
-- LexAlloc Migration 043 — Consolidate Duplicate Matters
--
-- Adds two functions for cleaning up matters that were created
-- as duplicates (e.g. before the BulkCreateMattersModal fix that
-- groups invoices by matter fingerprint):
--
--   public.la_normalize_matter_key(text) → text
--       Stable normalized form used for fuzzy matter-name matching.
--       Mirrors the JS normalizer in BulkCreateMattersModal.jsx so
--       behavior is consistent across DB and app.
--
--   public.la_preview_duplicate_matters(p_org_id uuid)
--       READ-ONLY. Returns one row per duplicate group with the
--       chosen keeper, the duplicate ids/names, and counts of how
--       many child rows would be moved. Run this FIRST.
--
--   public.la_consolidate_duplicate_matters(p_org_id uuid)
--       DESTRUCTIVE. For each duplicate group:
--         1. Picks the OLDEST matter as the keeper.
--         2. Repoints every FK on every child table from each
--            duplicate to the keeper.
--         3. DELETEs the now-empty duplicate matter.
--         4. Writes a 'matter.consolidated' row to la_audit_logs.
--       Runs as SECURITY DEFINER so it bypasses RLS on the
--       cascade-protected updates and the audit-log insert.
--
-- Recommended workflow (run in the Supabase SQL Editor):
--
--   -- 1. See what would happen, no writes:
--   SELECT * FROM public.la_preview_duplicate_matters('<your-org-uuid>');
--
--   -- 2. Dry-run the actual consolidation (rolled back):
--   BEGIN;
--   SELECT * FROM public.la_consolidate_duplicate_matters('<your-org-uuid>');
--   ROLLBACK;
--
--   -- 3. When the dry-run output looks right, do it for real:
--   BEGIN;
--   SELECT * FROM public.la_consolidate_duplicate_matters('<your-org-uuid>');
--   COMMIT;
--
-- Caveats:
--   * Matching is by normalized matter NAME within an org. Matters
--     with different names but logically the same are NOT merged.
--   * Child rows may collide on the keeper after merge (e.g. two
--     parties named "ABC General Contractors" if both duplicates
--     had one). The function does not deduplicate those — it just
--     consolidates the matters. Clean party/insurer dupes by hand
--     in the UI afterward.
--   * la_audit_logs entries on duplicates are repointed to the
--     keeper so the activity history is preserved on one matter.
-- ============================================================


-- ── Helper: normalize a matter caption for fuzzy comparison ──
-- Lowercase, replace anything that isn't [a-z0-9 -] with a space,
-- collapse whitespace, trim. Same algorithm as the JS helper.
CREATE OR REPLACE FUNCTION public.la_normalize_matter_key(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(lower(coalesce(s, '')), '[^a-z0-9\s\-]', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$;


-- ── Read-only preview of duplicate-matter groups ──
DROP FUNCTION IF EXISTS public.la_preview_duplicate_matters(uuid);
CREATE OR REPLACE FUNCTION public.la_preview_duplicate_matters(p_org_id uuid)
RETURNS TABLE(
  normalized_key          text,
  duplicate_count         int,
  keeper_id               uuid,
  keeper_name             text,
  keeper_created_at       timestamptz,
  duplicate_ids           uuid[],
  duplicate_names         text[],
  invoices_to_move        int,
  parties_to_move         int,
  policy_periods_to_move  int,
  apportionments_to_move  int,
  documents_to_move       int,
  notes_to_move           int,
  settlements_to_move     int,
  alerts_to_move          int,
  audit_logs_to_repoint   int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      public.la_normalize_matter_key(name) AS nkey,
      id, name, created_at,
      row_number() OVER (
        PARTITION BY public.la_normalize_matter_key(name)
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.la_matters
    WHERE org_id = p_org_id
      AND coalesce(public.la_normalize_matter_key(name), '') <> ''
  ),
  groups AS (
    SELECT
      nkey,
      array_agg(id    ORDER BY rn) AS all_ids,
      array_agg(name  ORDER BY rn) AS all_names,
      (array_agg(id          ORDER BY rn))[1] AS k_id,
      (array_agg(name        ORDER BY rn))[1] AS k_name,
      (array_agg(created_at  ORDER BY rn))[1] AS k_created_at,
      count(*)::int AS dup_count
    FROM ranked
    GROUP BY nkey
    HAVING count(*) > 1
  )
  SELECT
    g.nkey,
    g.dup_count,
    g.k_id,
    g.k_name,
    g.k_created_at,
    g.all_ids[2:],
    g.all_names[2:],
    (SELECT count(*)::int FROM public.la_invoices              WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_parties               WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_insurer_policy_periods WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_apportionments        WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_matter_documents      WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_matter_notes          WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_settlements           WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_policy_limit_alerts   WHERE matter_id = ANY(g.all_ids[2:])),
    (SELECT count(*)::int FROM public.la_audit_logs            WHERE matter_id = ANY(g.all_ids[2:]))
  FROM groups g
  ORDER BY g.dup_count DESC, g.nkey;
$$;


-- ── Destructive consolidation ──
DROP FUNCTION IF EXISTS public.la_consolidate_duplicate_matters(uuid);
CREATE OR REPLACE FUNCTION public.la_consolidate_duplicate_matters(p_org_id uuid)
RETURNS TABLE(
  duplicate_id   uuid,
  duplicate_name text,
  keeper_id      uuid,
  keeper_name    text,
  rows_moved     jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec     record;
  v_moved jsonb;
  v_count int;
BEGIN
  FOR rec IN
    WITH ranked AS (
      SELECT
        public.la_normalize_matter_key(name) AS nkey,
        id, name, created_at,
        row_number() OVER (
          PARTITION BY public.la_normalize_matter_key(name)
          ORDER BY created_at ASC, id ASC
        ) AS rn
      FROM public.la_matters
      WHERE org_id = p_org_id
        AND coalesce(public.la_normalize_matter_key(name), '') <> ''
    ),
    keepers AS (
      SELECT nkey, id AS keep_id, name AS keep_name
      FROM ranked
      WHERE rn = 1
    )
    SELECT
      r.id    AS dup_id,
      r.name  AS dup_name,
      k.keep_id,
      k.keep_name
    FROM ranked r
    JOIN keepers k USING (nkey)
    WHERE r.rn > 1
    ORDER BY r.created_at ASC
  LOOP
    v_moved := '{}'::jsonb;

    UPDATE public.la_invoices
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('invoices', v_count);

    UPDATE public.la_parties
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('parties', v_count);

    UPDATE public.la_insurer_policy_periods
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('insurer_policy_periods', v_count);

    UPDATE public.la_apportionments
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('apportionments', v_count);

    UPDATE public.la_matter_documents
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('matter_documents', v_count);

    UPDATE public.la_matter_notes
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('matter_notes', v_count);

    UPDATE public.la_settlements
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('settlements', v_count);

    UPDATE public.la_policy_limit_alerts
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('policy_limit_alerts', v_count);

    -- Repoint historical audit entries to the keeper so we don't
    -- lose the activity history when the duplicate is deleted.
    UPDATE public.la_audit_logs
       SET matter_id = rec.keep_id
     WHERE matter_id = rec.dup_id AND org_id = p_org_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_moved := v_moved || jsonb_build_object('audit_logs_repointed', v_count);

    -- All FKs are repointed; safe to delete the duplicate.
    DELETE FROM public.la_matters
     WHERE id = rec.dup_id AND org_id = p_org_id;

    -- Audit the consolidation itself (against the KEEPER).
    INSERT INTO public.la_audit_logs (
      org_id, matter_id, action, entity_type, entity_id, entity_name, metadata
    ) VALUES (
      p_org_id,
      rec.keep_id,
      'matter.consolidated',
      'matter',
      rec.dup_id,
      rec.dup_name,
      jsonb_build_object(
        'duplicate_id',   rec.dup_id,
        'duplicate_name', rec.dup_name,
        'keeper_id',      rec.keep_id,
        'keeper_name',    rec.keep_name,
        'rows_moved',     v_moved
      )
    );

    duplicate_id   := rec.dup_id;
    duplicate_name := rec.dup_name;
    keeper_id      := rec.keep_id;
    keeper_name    := rec.keep_name;
    rows_moved     := v_moved;
    RETURN NEXT;
  END LOOP;
END;
$$;


-- ── Permissions ──
-- Allow the SQL editor / service role to call these. If you later
-- want to expose them via PostgREST RPC you can GRANT to authenticated
-- and add an explicit auth check inside the consolidate function.
REVOKE ALL ON FUNCTION public.la_normalize_matter_key(text)               FROM public;
REVOKE ALL ON FUNCTION public.la_preview_duplicate_matters(uuid)          FROM public;
REVOKE ALL ON FUNCTION public.la_consolidate_duplicate_matters(uuid)      FROM public;

GRANT EXECUTE ON FUNCTION public.la_normalize_matter_key(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_preview_duplicate_matters(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_consolidate_duplicate_matters(uuid)   TO service_role;
