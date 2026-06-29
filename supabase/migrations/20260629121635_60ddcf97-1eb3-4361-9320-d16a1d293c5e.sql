
ALTER TABLE public.brain_products
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS protocolo_pdf_path text;

ALTER TABLE public.brain_knowledge
  ADD COLUMN IF NOT EXISTS imagem_protocolo_path text,
  ADD COLUMN IF NOT EXISTS protocolo_pdf_path text;

-- Storage RLS for brain-media bucket
DO $$ BEGIN
  CREATE POLICY "brain-media auth read" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'brain-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brain-media auth insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'brain-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brain-media auth update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'brain-media')
    WITH CHECK (bucket_id = 'brain-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "brain-media auth delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'brain-media');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
