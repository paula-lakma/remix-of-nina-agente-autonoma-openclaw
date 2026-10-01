CREATE TABLE public.order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'shopify',
  shopify_refund_id text NOT NULL,
  created_at_source timestamptz,
  processed_at timestamptz,
  updated_at_source timestamptz,
  total_amount numeric CHECK (total_amount IS NULL OR total_amount >= 0),
  shipping_amount numeric CHECK (shipping_amount IS NULL OR shipping_amount >= 0),
  refunded_product_amount numeric CHECK (refunded_product_amount IS NULL OR refunded_product_amount >= 0),
  unallocated_amount numeric CHECK (unallocated_amount IS NULL OR unallocated_amount >= 0),
  currency text,
  note text,
  transactions jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  financial_status text CHECK (financial_status IS NULL OR financial_status IN ('success','pending','failed','mixed')),
  webhook_payload jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_refunds_source_refund_key UNIQUE (source, shopify_refund_id)
);

GRANT SELECT ON public.order_refunds TO authenticated;
GRANT ALL ON public.order_refunds TO service_role;

ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_refunds_select_admin_manager ON public.order_refunds
  FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

CREATE INDEX order_refunds_order_id_idx ON public.order_refunds (order_id);
CREATE INDEX order_refunds_processed_at_idx ON public.order_refunds (processed_at);

CREATE TRIGGER update_order_refunds_updated_at
  BEFORE UPDATE ON public.order_refunds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders
  ADD COLUMN total_received numeric CONSTRAINT orders_total_received_chk CHECK (total_received IS NULL OR total_received >= 0),
  ADD COLUMN total_refunded numeric CONSTRAINT orders_total_refunded_chk CHECK (total_refunded IS NULL OR total_refunded >= 0),
  ADD COLUMN refunded_shipping numeric CONSTRAINT orders_refunded_shipping_chk CHECK (refunded_shipping IS NULL OR refunded_shipping >= 0),
  ADD COLUMN net_payment numeric,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN is_paid boolean,
  ADD COLUMN refund_count integer CONSTRAINT orders_refund_count_chk CHECK (refund_count IS NULL OR refund_count >= 0),
  ADD COLUMN first_refunded_at timestamptz,
  ADD COLUMN last_refunded_at timestamptz,
  ADD COLUMN refunded_product_amount numeric CONSTRAINT orders_refunded_product_amount_chk CHECK (refunded_product_amount IS NULL OR refunded_product_amount >= 0),
  ADD COLUMN unallocated_refund_amount numeric CONSTRAINT orders_unallocated_refund_amount_chk CHECK (unallocated_refund_amount IS NULL OR unallocated_refund_amount >= 0),
  ADD COLUMN financials_verified_at timestamptz;

CREATE INDEX orders_is_paid_created_idx ON public.orders (is_paid, created_at_source);