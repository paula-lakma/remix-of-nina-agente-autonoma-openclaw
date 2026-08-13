CREATE TABLE public.shopify_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text NOT NULL DEFAULT 'unknown',
  shopify_event_id text,
  order_number text,
  phone_number text,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shopify_events_event_id_key ON public.shopify_events (shopify_event_id) WHERE shopify_event_id IS NOT NULL;
CREATE INDEX shopify_events_created_at_idx ON public.shopify_events (created_at DESC);

GRANT SELECT ON public.shopify_events TO authenticated;
GRANT ALL ON public.shopify_events TO service_role;

ALTER TABLE public.shopify_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e managers podem ver eventos shopify"
ON public.shopify_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_shopify_events_updated_at
BEFORE UPDATE ON public.shopify_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();