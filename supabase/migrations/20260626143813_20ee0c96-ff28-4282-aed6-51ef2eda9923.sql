ALTER TABLE public.brain_knowledge
  ADD COLUMN IF NOT EXISTS imagem_protocolo_url text,
  ADD COLUMN IF NOT EXISTS protocolo_pdf_url text,
  ADD COLUMN IF NOT EXISTS tipo_uso text,
  ADD COLUMN IF NOT EXISTS categoria_intencao text[] NOT NULL DEFAULT '{}'::text[];