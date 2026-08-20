ALTER TABLE public.tracking_send_locks DROP CONSTRAINT IF EXISTS tracking_send_locks_source_check;
ALTER TABLE public.tracking_send_locks ADD CONSTRAINT tracking_send_locks_source_check
  CHECK (source = ANY (ARRAY['manual_tracking'::text, 'shopify_webhook'::text, 'shopify'::text, 'shopify_seed'::text]));