-- Converte brain_products.category de TEXT para TEXT[] (multi-seleção)
ALTER TABLE public.brain_products
  ALTER COLUMN category DROP DEFAULT,
  ALTER COLUMN category TYPE text[] USING CASE WHEN category IS NULL OR category = '' THEN '{}'::text[] ELSE ARRAY[category] END,
  ALTER COLUMN category SET DEFAULT '{}';
