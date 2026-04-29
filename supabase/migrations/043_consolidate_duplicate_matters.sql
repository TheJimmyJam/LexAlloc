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
--       Verifies the calling auth.uid() is either a platform admin
--       OR a member of p_org_id whose role is 'admin'.
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
-- 1. Lowercase.
-- 2. Strip parenthesized text — engagement qualifiers like "(coverage)",
--    "(umbrella monitoring)", "(cumis)" make captions look different even
--    though they describe the same litigation; we want them to match.
-- 3. Replace anything that isn't [a-z0-9 -] with a space.
-- 4. Collapse whitespace and trim.
-- Mirrors the JS helper in BulkCreateMattersModal.jsx so DB and app agree.
CREATE OR REPLACE FUNCTION public.la_normalize_matter_key(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(s, '')), '\([^)]*\)', ' ', 'g'),
        '[^a-z0-9\s\-]', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;


-- ── Auth helper used by the preview and consolidate functions ──
-- Returns TRUE if the calling auth.uid() is allowed to consolidate
-- duplicates inside p_org_id: either a platform admin, or an admin
-- member of that org. Returns FALSE otherwise.
-- Defined BEFORE the preview/consolidate functions because they reference it.
CREATE OR REPLACE FUNCTION public.la_can_consolidate_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.la_profiles
     WHERE id = auth.uid()
       AND (is_platform_admin = TRUE
            OR (org_id = p_org_id AND role = 'admin'))
  );
$$;


-- ── Read-only preview of duplicate-matter groups ──
-- Anyone who can read the org's matters can preview duplicates. We still
-- fence with the same auth helper so the function returns NOTHING (rather
-- than leaking another org's data) if called with the wrong p_org_id.
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
      -- Caller must be platform admin or org-admin of p_org_id; otherwise
      -- this predicate is FALSE and the function returns zero rows.
      AND public.la_can_consolidate_org(p_org_id)
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
  -- Auth gate: only platform admins or org-admin members may run this.
  IF NOT public.la_can_consolidate_org(p_org_id) THEN
    RAISE EXCEPTION 'Not authorized to consolidate matters in this organization'
      USING ERRCODE = '42501';
  END IF;

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
-- Both functions are exposed to authenticated users via PostgREST RPC.
-- Auth is enforced INSIDE the functions via la_can_consolidate_org() so
-- only platform admins or org-admin members can use them on a given org.
REVOKE ALL ON FUNCTION public.la_normalize_matter_key(text)               FROM public;
REVOKE ALL ON FUNCTION public.la_can_consolidate_org(uuid)                FROM public;
REVOKE ALL ON FUNCTION public.la_preview_duplicate_matters(uuid)          FROM public;
REVOKE ALL ON FUNCTION public.la_consolidate_duplicate_matters(uuid)      FROM public;

GRANT EXECUTE ON FUNCTION public.la_normalize_matter_key(text)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_can_consolidate_org(uuid)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_preview_duplicate_matters(uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.la_consolidate_duplicate_matters(uuid)   TO authenticated, service_role;
