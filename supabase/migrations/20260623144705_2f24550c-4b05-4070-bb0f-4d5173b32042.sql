ALTER TABLE public.brain_products
  ADD COLUMN IF NOT EXISTS site_url TEXT,
  ADD COLUMN IF NOT EXISTS mercadolivre_url TEXT;