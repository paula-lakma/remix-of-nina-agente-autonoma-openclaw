CREATE TABLE public.brain_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  knowledge_text text,
  image_url text,
  image_path text,
  pdf_url text,
  pdf_path text,
  drive_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT brain_protocols_status_check CHECK (status IN ('draft','approved','inactive')),
  CONSTRAINT brain_protocols_owner_slug_unique UNIQUE (owner_user_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brain_protocols TO authenticated;
GRANT ALL ON public.brain_protocols TO service_role;

ALTER TABLE public.brain_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own protocols"
ON public.brain_protocols FOR ALL TO authenticated
USING (auth.uid() = owner_user_id)
WITH CHECK (auth.uid() = owner_user_id);

CREATE TRIGGER update_brain_protocols_updated_at
BEFORE UPDATE ON public.brain_protocols
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();