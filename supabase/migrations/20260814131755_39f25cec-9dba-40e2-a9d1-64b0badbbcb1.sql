CREATE TABLE public.shopify_shipment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id text NOT NULL,
  tracking_number text NOT NULL,
  order_number text,
  phone_number text,
  event_id uuid,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shopify_shipment_notifications_unique UNIQUE (fulfillment_id, tracking_number)
);

GRANT SELECT ON public.shopify_shipment_notifications TO authenticated;
GRANT ALL ON public.shopify_shipment_notifications TO service_role;

ALTER TABLE public.shopify_shipment_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view shipment notifications"
ON public.shopify_shipment_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_shopify_shipment_notifications_updated_at
BEFORE UPDATE ON public.shopify_shipment_notifications
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.shopify_shipment_notifications (fulfillment_id, tracking_number, order_number, phone_number, event_id, status, created_at)
SELECT COALESCE(e.raw_payload->>'id', e.normalized->>'order_id'),
       e.normalized->>'tracking_number',
       e.order_number,
       e.phone_number,
       e.id,
       'sent',
       e.created_at
FROM public.shopify_events e
WHERE e.topic LIKE 'fulfillments/%'
  AND e.send_status IN ('queued','sent')
  AND COALESCE(e.normalized->>'tracking_number','') <> ''
ON CONFLICT (fulfillment_id, tracking_number) DO NOTHING;