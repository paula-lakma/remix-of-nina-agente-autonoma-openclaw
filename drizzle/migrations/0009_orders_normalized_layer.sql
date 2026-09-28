CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'shopify',
  source_order_id text NOT NULL,
  order_number text,
  shopify_customer_id text,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_match_status text NOT NULL DEFAULT 'none' CHECK (contact_match_status IN ('matched','none','ambiguous','no_phone')),
  customer_name text,
  customer_email text,
  customer_phone_raw text,
  customer_phone_normalized text,
  currency text,
  financial_status text,
  fulfillment_status text,
  is_test boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  created_at_source timestamptz,
  processed_at_source timestamptz,
  updated_at_source timestamptz,
  subtotal numeric(12,2),
  current_subtotal numeric(12,2),
  total_discount numeric(12,2),
  shipping_amount numeric(12,2),
  total_amount numeric(12,2),
  net_product_revenue numeric(12,2),
  coupon_codes text[] NOT NULL DEFAULT '{}',
  valid_order boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  source_event_id uuid REFERENCES public.shopify_events(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_source_order_uniq UNIQUE (source, source_order_id)
);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_line_item_id text NOT NULL,
  shopify_product_id text,
  shopify_variant_id text,
  sku text,
  product_name text,
  variant_name text,
  quantity integer NOT NULL DEFAULT 0,
  current_quantity integer,
  unit_price numeric(12,2),
  discount_amount numeric(12,2),
  line_total numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_order_line_uniq UNIQUE (order_id, source_line_item_id)
);

GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_select ON public.orders FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));
CREATE POLICY order_items_select ON public.order_items FOR SELECT TO authenticated USING (public.is_operational_staff(auth.uid()));

CREATE INDEX orders_shopify_customer_idx ON public.orders (shopify_customer_id);
CREATE INDEX orders_contact_idx ON public.orders (contact_id);
CREATE INDEX orders_phone_idx ON public.orders (customer_phone_normalized);
CREATE INDEX orders_created_source_idx ON public.orders (created_at_source);
CREATE INDEX orders_valid_created_idx ON public.orders (valid_order, created_at_source);
CREATE INDEX orders_financial_idx ON public.orders (financial_status);
CREATE INDEX order_items_product_idx ON public.order_items (shopify_product_id);
CREATE INDEX order_items_variant_idx ON public.order_items (shopify_variant_id);

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.normalize_br_phone(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text;
BEGIN
  d := ltrim(regexp_replace(coalesce(p,''), '\D', '', 'g'), '0');
  IF d = '' THEN RETURN NULL; END IF;
  IF length(d) <= 11 AND left(d,2) <> '55' THEN d := '55' || d; END IF;
  IF length(d) < 12 OR length(d) > 15 THEN
    RETURN CASE WHEN length(d) >= 10 THEN d ELSE NULL END;
  END IF;
  RETURN d;
END $$;

-- Normaliza UM payload de pedido. Retorna 'upserted' ou 'skipped_older'.
CREATE OR REPLACE FUNCTION public.sync_shopify_order_payload(p_event_id uuid, p jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order_id uuid; v_phone_raw text; v_phone text; v_contact uuid; v_status text; v_n int;
  v_upd timestamptz; v_fin text; v_line_ids text[];
BEGIN
  IF p->>'id' IS NULL OR NOT (p ? 'line_items') THEN RETURN 'not_order'; END IF;
  v_upd := (p->>'updated_at')::timestamptz;
  IF EXISTS (SELECT 1 FROM orders o WHERE o.source='shopify' AND o.source_order_id = p->>'id'
             AND o.updated_at_source IS NOT NULL AND v_upd IS NOT NULL AND o.updated_at_source > v_upd) THEN
    RETURN 'skipped_older';
  END IF;

  v_phone_raw := coalesce(nullif(p->>'phone',''), nullif(p#>>'{shipping_address,phone}',''),
                          nullif(p#>>'{customer,phone}',''), nullif(p#>>'{billing_address,phone}',''),
                          nullif(p#>>'{customer,default_address,phone}',''));
  v_phone := normalize_br_phone(v_phone_raw);
  v_contact := NULL;
  IF v_phone IS NULL THEN v_status := 'no_phone';
  ELSE
    SELECT count(*), min(c.id::text)::uuid INTO v_n, v_contact
    FROM contacts c WHERE normalize_br_phone(c.phone_number) = v_phone;
    IF v_n = 1 THEN v_status := 'matched';
    ELSIF v_n = 0 THEN v_status := 'none'; v_contact := NULL;
    ELSE v_status := 'ambiguous'; v_contact := NULL; END IF;
  END IF;

  v_fin := p->>'financial_status';

  INSERT INTO orders AS o (source, source_order_id, order_number, shopify_customer_id, contact_id, contact_match_status,
    customer_name, customer_email, customer_phone_raw, customer_phone_normalized, currency, financial_status,
    fulfillment_status, is_test, cancelled_at, created_at_source, processed_at_source, updated_at_source,
    subtotal, current_subtotal, total_discount, shipping_amount, total_amount, net_product_revenue,
    coupon_codes, valid_order, source_event_id)
  VALUES ('shopify', p->>'id', coalesce(p->>'order_number', ltrim(p->>'name','#')), p#>>'{customer,id}', v_contact, v_status,
    nullif(trim(concat_ws(' ', coalesce(p#>>'{customer,first_name}', p#>>'{shipping_address,first_name}'),
                               coalesce(p#>>'{customer,last_name}', p#>>'{shipping_address,last_name}'))), ''),
    coalesce(nullif(p->>'email',''), nullif(p->>'contact_email',''), p#>>'{customer,email}'),
    v_phone_raw, v_phone, p->>'currency', v_fin, p->>'fulfillment_status',
    coalesce((p->>'test')::boolean, false), (p->>'cancelled_at')::timestamptz,
    (p->>'created_at')::timestamptz, (p->>'processed_at')::timestamptz, v_upd,
    (p->>'subtotal_price')::numeric, (p->>'current_subtotal_price')::numeric, (p->>'total_discounts')::numeric,
    (p#>>'{total_shipping_price_set,shop_money,amount}')::numeric, (p->>'total_price')::numeric,
    (p->>'current_subtotal_price')::numeric,
    coalesce((SELECT array_agg(d->>'code') FROM jsonb_array_elements(coalesce(p->'discount_codes','[]')) d WHERE d->>'code' IS NOT NULL), '{}'),
    (v_fin = 'paid' AND p->>'cancelled_at' IS NULL AND NOT coalesce((p->>'test')::boolean, false)),
    p_event_id)
  ON CONFLICT (source, source_order_id) DO UPDATE SET
    order_number = EXCLUDED.order_number, shopify_customer_id = EXCLUDED.shopify_customer_id,
    contact_id = EXCLUDED.contact_id, contact_match_status = EXCLUDED.contact_match_status,
    customer_name = EXCLUDED.customer_name, customer_email = EXCLUDED.customer_email,
    customer_phone_raw = EXCLUDED.customer_phone_raw, customer_phone_normalized = EXCLUDED.customer_phone_normalized,
    currency = EXCLUDED.currency, financial_status = EXCLUDED.financial_status,
    fulfillment_status = EXCLUDED.fulfillment_status, is_test = EXCLUDED.is_test,
    cancelled_at = EXCLUDED.cancelled_at, created_at_source = EXCLUDED.created_at_source,
    processed_at_source = EXCLUDED.processed_at_source, updated_at_source = EXCLUDED.updated_at_source,
    subtotal = EXCLUDED.subtotal, current_subtotal = EXCLUDED.current_subtotal,
    total_discount = EXCLUDED.total_discount, shipping_amount = EXCLUDED.shipping_amount,
    total_amount = EXCLUDED.total_amount, net_product_revenue = EXCLUDED.net_product_revenue,
    coupon_codes = EXCLUDED.coupon_codes, valid_order = EXCLUDED.valid_order,
    source_event_id = EXCLUDED.source_event_id
  RETURNING o.id INTO v_order_id;

  INSERT INTO order_items AS i (order_id, source_line_item_id, shopify_product_id, shopify_variant_id, sku,
    product_name, variant_name, quantity, current_quantity, unit_price, discount_amount, line_total)
  SELECT v_order_id, l->>'id', l->>'product_id', l->>'variant_id', nullif(l->>'sku',''),
    coalesce(l->>'title', l->>'name'), nullif(l->>'variant_title',''),
    coalesce((l->>'quantity')::int, 0), (l->>'current_quantity')::int, (l->>'price')::numeric,
    da.amt,
    (l->>'price')::numeric * coalesce((l->>'current_quantity')::int, (l->>'quantity')::int, 0) - coalesce(da.amt, 0)
  FROM jsonb_array_elements(p->'line_items') l
  LEFT JOIN LATERAL (SELECT sum((a->>'amount')::numeric) AS amt
                     FROM jsonb_array_elements(coalesce(l->'discount_allocations','[]')) a) da ON true
  WHERE l->>'id' IS NOT NULL
  ON CONFLICT (order_id, source_line_item_id) DO UPDATE SET
    shopify_product_id = EXCLUDED.shopify_product_id, shopify_variant_id = EXCLUDED.shopify_variant_id,
    sku = EXCLUDED.sku, product_name = EXCLUDED.product_name, variant_name = EXCLUDED.variant_name,
    quantity = EXCLUDED.quantity, current_quantity = EXCLUDED.current_quantity,
    unit_price = EXCLUDED.unit_price, discount_amount = EXCLUDED.discount_amount, line_total = EXCLUDED.line_total;

  SELECT array_agg(l->>'id') INTO v_line_ids FROM jsonb_array_elements(p->'line_items') l WHERE l->>'id' IS NOT NULL;
  DELETE FROM order_items WHERE order_id = v_order_id AND source_line_item_id <> ALL (coalesce(v_line_ids, '{}'));
  RETURN 'upserted';
END $$;

-- Backfill / reconciliação em lote (versão mais recente por pedido).
CREATE OR REPLACE FUNCTION public.sync_shopify_orders(p_since timestamptz DEFAULT now() - interval '2 days')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_res text; v_up int := 0; v_sk int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (e.raw_payload->>'id') e.id AS event_id, e.raw_payload AS payload
    FROM shopify_events e
    WHERE e.topic LIKE 'orders/%' AND e.raw_payload ? 'line_items' AND e.raw_payload->>'id' IS NOT NULL
      AND e.created_at >= p_since
    ORDER BY e.raw_payload->>'id', (e.raw_payload->>'updated_at')::timestamptz DESC NULLS LAST, e.created_at DESC
  LOOP
    v_res := sync_shopify_order_payload(r.event_id, r.payload);
    IF v_res = 'upserted' THEN v_up := v_up + 1; ELSE v_sk := v_sk + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('upserted', v_up, 'skipped', v_sk, 'since', p_since, 'ran_at', now());
END $$;

-- Gatilho leve e à prova de falha: nunca bloqueia a gravação do evento bruto.
CREATE OR REPLACE FUNCTION public.shopify_events_sync_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM sync_shopify_order_payload(NEW.id, NEW.raw_payload);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[orders-sync] falha ao normalizar evento %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

CREATE TRIGGER shopify_events_sync_order_trg
AFTER INSERT ON public.shopify_events
FOR EACH ROW WHEN (NEW.topic LIKE 'orders/%')
EXECUTE FUNCTION public.shopify_events_sync_order();

REVOKE ALL ON FUNCTION public.sync_shopify_order_payload(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_shopify_orders(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shopify_events_sync_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_shopify_order_payload(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_shopify_orders(timestamptz) TO service_role;

SELECT public.sync_shopify_orders('-infinity'::timestamptz);

SELECT cron.schedule('sync-shopify-orders-daily', '30 6 * * *', $cron$SELECT public.sync_shopify_orders(now() - interval '2 days')$cron$);