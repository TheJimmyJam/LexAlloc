-- Migration 006: Matter Documents
-- Stores coverage opinions, ROR letters, settlement agreements, etc. per matter

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.la_matter_documents (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  matter_id   uuid REFERENCES public.la_matters(id)       ON DELETE CASCADE NOT NULL,
  org_id      uuid REFERENCES public.la_organizations(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES public.la_profiles(id)      ON DELETE SET NULL,
  name        text NOT NULL,
  doc_type    text NOT NULL DEFAULT 'other' CHECK (doc_type IN (
                'coverage_opinion',
                'ror_letter',
                'settlement_agreement',
                'demand_letter',
                'court_filing',
                'mediation_brief',
                'expert_report',
                'other'
              )),
  file_path   text NOT NULL,
  file_name   text NOT NULL,
  file_size   bigint,
  file_mime   text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matter_documents_matter ON public.la_matter_documents(matter_id);
CREATE INDEX IF NOT EXISTS idx_matter_documents_org    ON public.la_matter_documents(org_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.la_matter_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'la_matter_documents' AND policyname = 'Documents: org isolation'
  ) THEN
    CREATE POLICY "Documents: org isolation" ON public.la_matter_documents
      FOR ALL USING (org_id = public.current_org_id());
  END IF;
END $$;

-- ── Storage bucket ─────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('la_documents', 'la_documents', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Documents bucket: org upload'
  ) THEN
    CREATE POLICY "Documents bucket: org upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'la_documents' AND
        (storage.foldername(name))[1] = (
          SELECT org_id::text FROM public.la_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Documents bucket: org read'
  ) THEN
    CREATE POLICY "Documents bucket: org read" ON storage.objects
      FOR SELECT TO authenticated
      USING (
        bucket_id = 'la_documents' AND
        (storage.foldername(name))[1] = (
          SELECT org_id::text FROM public.la_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Documents bucket: org delete'
  ) THEN
    CREATE POLICY "Documents bucket: org delete" ON storage.objects
      FOR DELETE TO authenticated
      USING (
        bucket_id = 'la_documents' AND
        (storage.foldername(name))[1] = (
          SELECT org_id::text FROM public.la_profiles WHERE id = auth.uid()
        )
      );
  END IF;
END $$;
