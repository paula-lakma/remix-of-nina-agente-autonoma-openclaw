-- Ordem real dos eventos mesmo dentro da mesma transação.
ALTER TABLE public.contact_consents ALTER COLUMN occurred_at SET DEFAULT clock_timestamp();
ALTER TABLE public.contact_consents ALTER COLUMN created_at SET DEFAULT clock_timestamp();