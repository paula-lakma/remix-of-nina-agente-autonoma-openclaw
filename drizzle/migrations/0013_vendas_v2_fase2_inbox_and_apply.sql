-- Vendas V2 Fase 2 Passo 3: caixa de entrada durável + gravação atômica dos financeiros.
-- Aditiva: não altera tabelas/funções existentes.

CREATE TABLE public.shopify_financial_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id text NOT NULL UNIQUE,
  topic text NOT NULL,
  shopify_order_id text NOT NULL,
  shopify_refund_id text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.shopify_financial_inbox FROM PUBLIC;
REVOKE ALL ON public.shopify_financial_inbox FROM anon;
REVOKE ALL ON public.shopify_financial_inbox FROM authenticated;
GRANT ALL ON public.shopify_financial_inbox TO service_role;

ALTER TABLE public.shopify_financial_inbox ENABLE ROW LEVEL SECURITY;
-- Sem policies: nenhum usuário do app lê ou escreve.

CREATE INDEX shopify_financial_inbox_queue_idx ON public.shopify_financial_inbox (status, next_attempt_at);
CREATE INDEX shopify_financial_inbox_order_idx ON public.shopify_financial_inbox (shopify_order_id);

CREATE TRIGGER update_shopify_financial_inbox_updated_at
  BEFORE UPDATE ON public.shopify_financial_inbox
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Claim da fila (ainda não usado/agendado).
CREATE OR REPLACE FUNCTION public.claim_shopify_financial_inbox(p_limit integer DEFAULT 25)
RETURNS SETOF public.shopify_financial_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.shopify_financial_inbox i
     SET status = 'processing', claimed_at = pg_catalog.now(), attempts = i.attempts + 1
   WHERE i.id IN (
     SELECT q.id FROM public.shopify_financial_inbox q
      WHERE q.status = 'pending' AND q.next_attempt_at <= pg_catalog.now()
      ORDER BY q.next_attempt_at, q.created_at
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
      FOR UPDATE SKIP LOCKED)
  RETURNING i.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_shopify_financial_inbox(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_shopify_financial_inbox(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_shopify_financial_inbox(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_shopify_financial_inbox(integer) TO service_role;

-- Gravação atômica: snapshot dos refunds + resumo V2 em orders (somente as 12 colunas financeiras).
CREATE OR REPLACE FUNCTION public.apply_order_financials(p_order_id uuid, p_refunds jsonb, p_summary jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r jsonb;
  v_existing public.order_refunds%ROWTYPE;
  v_upserted integer := 0;
  v_stale integer := 0;
BEGIN
  IF p_order_id IS NULL OR p_summary IS NULL OR pg_catalog.jsonb_typeof(p_summary) <> 'object' THEN
    RAISE EXCEPTION 'apply_order_financials: parâmetros inválidos';
  END IF;
  IF p_refunds IS NULL OR pg_catalog.jsonb_typeof(p_refunds) <> 'array' THEN
    RAISE EXCEPTION 'apply_order_financials: refunds deve ser array';
  END IF;
  PERFORM 1 FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'apply_order_financials: pedido inexistente'; END IF;

  FOR r IN SELECT * FROM pg_catalog.jsonb_array_elements(p_refunds) LOOP
    IF COALESCE(r->>'shopify_refund_id', '') = '' THEN
      RAISE EXCEPTION 'apply_order_financials: refund sem id';
    END IF;
    SELECT * INTO v_existing FROM public.order_refunds x
     WHERE x.source = 'shopify' AND x.shopify_refund_id = r->>'shopify_refund_id' FOR UPDATE;
    IF FOUND THEN
      IF v_existing.order_id <> p_order_id THEN
        RAISE EXCEPTION 'apply_order_financials: refund pertence a outro pedido';
      END IF;
      IF v_existing.updated_at_source IS NOT NULL
         AND (r->>'updated_at_source') IS NOT NULL
         AND (r->>'updated_at_source')::timestamptz < v_existing.updated_at_source THEN
        v_stale := v_stale + 1;
        CONTINUE;
      END IF;
    END IF;
    INSERT INTO public.order_refunds AS t (
      order_id, source, shopify_refund_id, created_at_source, processed_at, updated_at_source,
      total_amount, shipping_amount, refunded_product_amount, unallocated_amount, currency, note,
      transactions, line_items, financial_status, webhook_payload, last_verified_at)
    VALUES (
      p_order_id, 'shopify', r->>'shopify_refund_id',
      (r->>'created_at_source')::timestamptz, (r->>'processed_at')::timestamptz, (r->>'updated_at_source')::timestamptz,
      (r->>'total_amount')::numeric, (r->>'shipping_amount')::numeric,
      (r->>'refunded_product_amount')::numeric, (r->>'unallocated_amount')::numeric,
      r->>'currency', r->>'note',
      COALESCE(r->'transactions', '[]'::jsonb), COALESCE(r->'line_items', '[]'::jsonb),
      r->>'financial_status', NULL, (r->>'last_verified_at')::timestamptz)
    ON CONFLICT (source, shopify_refund_id) DO UPDATE SET
      created_at_source = EXCLUDED.created_at_source,
      processed_at = EXCLUDED.processed_at,
      updated_at_source = EXCLUDED.updated_at_source,
      total_amount = EXCLUDED.total_amount,
      shipping_amount = EXCLUDED.shipping_amount,
      refunded_product_amount = EXCLUDED.refunded_product_amount,
      unallocated_amount = EXCLUDED.unallocated_amount,
      currency = EXCLUDED.currency,
      note = EXCLUDED.note,
      transactions = EXCLUDED.transactions,
      line_items = EXCLUDED.line_items,
      financial_status = EXCLUDED.financial_status,
      last_verified_at = EXCLUDED.last_verified_at;
    v_upserted := v_upserted + 1;
  END LOOP;

  UPDATE public.orders o SET
    total_received = (p_summary->>'total_received')::numeric,
    total_refunded = (p_summary->>'total_refunded')::numeric,
    refunded_shipping = (p_summary->>'refunded_shipping')::numeric,
    net_payment = (p_summary->>'net_payment')::numeric,
    paid_at = (p_summary->>'paid_at')::timestamptz,
    is_paid = (p_summary->>'is_paid')::boolean,
    refund_count = (p_summary->>'refund_count')::integer,
    first_refunded_at = (p_summary->>'first_refunded_at')::timestamptz,
    last_refunded_at = (p_summary->>'last_refunded_at')::timestamptz,
    refunded_product_amount = (p_summary->>'refunded_product_amount')::numeric,
    unallocated_refund_amount = (p_summary->>'unallocated_refund_amount')::numeric,
    financials_verified_at = (p_summary->>'financials_verified_at')::timestamptz
  WHERE o.id = p_order_id;

  RETURN pg_catalog.jsonb_build_object('refunds_upserted', v_upserted, 'refunds_skipped_stale', v_stale);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_order_financials(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_order_financials(uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_order_financials(uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_financials(uuid, jsonb, jsonb) TO service_role;