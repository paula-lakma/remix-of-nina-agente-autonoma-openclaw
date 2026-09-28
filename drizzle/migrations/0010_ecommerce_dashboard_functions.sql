-- Dashboard E-commerce V1: funções de leitura agregada sobre orders/order_items.
-- Acesso no banco: admin, manager, sdr (is_operational_staff). App V1 restringe a admin/manager.

CREATE OR REPLACE FUNCTION public.ecom_customer_key(_contact_id uuid, _phone text, _shopify_customer_id text, _order_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE('c:' || _contact_id::text, 'p:' || NULLIF(_phone, ''), 's:' || NULLIF(_shopify_customer_id, ''), 'o:' || _order_id::text)
$$;

CREATE OR REPLACE FUNCTION public.ecom_assert_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_operational_staff(auth.uid()) THEN
    RAISE EXCEPTION 'acesso negado' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ecom_summary(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev_from timestamptz := p_from - (p_to - p_from);
  v_cur jsonb; v_prev jsonb; v_cust jsonb; v_status jsonb; v_bounds jsonb;
BEGIN
  PERFORM public.ecom_assert_access();

  SELECT jsonb_build_object(
    'orders', count(*),
    'revenue', COALESCE(sum(net_product_revenue), 0),
    'shipping', COALESCE(sum(shipping_amount), 0),
    'total', COALESCE(sum(total_amount), 0),
    'customers', count(DISTINCT public.ecom_customer_key(contact_id, customer_phone_normalized, shopify_customer_id, id)),
    'with_coupon_revenue', COALESCE(sum(net_product_revenue) FILTER (WHERE cardinality(coupon_codes) > 0), 0))
  INTO v_cur FROM orders
  WHERE valid_order AND created_at_source >= p_from AND created_at_source < p_to;

  SELECT jsonb_build_object(
    'orders', count(*),
    'revenue', COALESCE(sum(net_product_revenue), 0),
    'customers', count(DISTINCT public.ecom_customer_key(contact_id, customer_phone_normalized, shopify_customer_id, id)))
  INTO v_prev FROM orders
  WHERE valid_order AND created_at_source >= v_prev_from AND created_at_source < p_from;

  -- Classificação: clientes do período, avaliados pelo histórico válido até o fim do período.
  WITH hist AS (
    SELECT public.ecom_customer_key(contact_id, customer_phone_normalized, shopify_customer_id, id) k, created_at_source d
    FROM orders WHERE valid_order AND created_at_source < p_to
  ), per AS (
    SELECT k, min(d) first_d, count(*) n_hist, count(*) FILTER (WHERE d >= p_from) n_in
    FROM hist GROUP BY k HAVING count(*) FILTER (WHERE d >= p_from) > 0
  )
  SELECT jsonb_build_object(
    'new', count(*) FILTER (WHERE first_d >= p_from),
    'returning', count(*) FILTER (WHERE first_d < p_from),
    'recurring', count(*) FILTER (WHERE n_hist >= 2),
    'repurchase', count(*) FILTER (WHERE first_d < p_from OR n_in >= 2))
  INTO v_cust FROM per;

  SELECT jsonb_build_object(
    'test', count(*) FILTER (WHERE is_test),
    'cancelled', count(*) FILTER (WHERE NOT is_test AND (cancelled_at IS NOT NULL OR financial_status IN ('voided','refunded'))),
    'pending', count(*) FILTER (WHERE NOT is_test AND cancelled_at IS NULL AND financial_status IN ('pending','authorized','partially_paid')),
    'other_invalid', count(*) FILTER (WHERE NOT is_test AND cancelled_at IS NULL AND COALESCE(financial_status,'') NOT IN ('voided','refunded','pending','authorized','partially_paid')))
  INTO v_status FROM orders
  WHERE NOT valid_order AND created_at_source >= p_from AND created_at_source < p_to;

  SELECT jsonb_build_object('first_order_at', min(created_at_source), 'last_order_at', max(created_at_source))
  INTO v_bounds FROM orders;

  RETURN jsonb_build_object('current', v_cur, 'previous', v_prev, 'customers', v_cust, 'status', v_status, 'bounds', v_bounds);
END $$;

CREATE OR REPLACE FUNCTION public.ecom_timeseries(p_from timestamptz, p_to timestamptz, p_bucket text, p_tz text DEFAULT 'America/Sao_Paulo')
RETURNS TABLE(bucket_start timestamp, orders bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_step interval;
BEGIN
  PERFORM public.ecom_assert_access();
  IF p_bucket NOT IN ('hour','day','week') THEN RAISE EXCEPTION 'bucket inválido'; END IF;
  v_step := ('1 ' || p_bucket)::interval;
  RETURN QUERY
  WITH s AS (
    SELECT generate_series(date_trunc(p_bucket, p_from AT TIME ZONE p_tz),
                           date_trunc(p_bucket, (p_to - interval '1 microsecond') AT TIME ZONE p_tz), v_step) b
  ), a AS (
    SELECT date_trunc(p_bucket, o.created_at_source AT TIME ZONE p_tz) b, count(*) n, sum(o.net_product_revenue) r
    FROM orders o WHERE o.valid_order AND o.created_at_source >= p_from AND o.created_at_source < p_to GROUP BY 1
  )
  SELECT s.b, COALESCE(a.n, 0), COALESCE(a.r, 0) FROM s LEFT JOIN a ON a.b = s.b ORDER BY s.b;
END $$;

CREATE OR REPLACE FUNCTION public.ecom_top_products(p_from timestamptz, p_to timestamptz, p_order text DEFAULT 'revenue', p_limit int DEFAULT 10)
RETURNS TABLE(product_key text, product_name text, quantity bigint, orders bigint, revenue numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ecom_assert_access();
  RETURN QUERY
  WITH it AS (
    SELECT COALESCE(NULLIF(i.shopify_product_id,''), 'n:' || COALESCE(i.product_name,'(sem nome)')) k,
           i.product_name nm, o.created_at_source d, o.id oid,
           COALESCE(i.current_quantity, i.quantity) q, COALESCE(i.line_total, 0) lt
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.valid_order AND o.created_at_source >= p_from AND o.created_at_source < p_to
  )
  SELECT k, (array_agg(nm ORDER BY d DESC))[1], sum(q)::bigint, count(DISTINCT oid), sum(lt)
  FROM it GROUP BY k
  ORDER BY CASE WHEN p_order = 'quantity' THEN sum(q) ELSE sum(lt) END DESC, 2
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
END $$;

CREATE OR REPLACE FUNCTION public.ecom_top_coupons(p_from timestamptz, p_to timestamptz, p_limit int DEFAULT 10)
RETURNS TABLE(coupon text, orders bigint, revenue numeric, avg_ticket numeric, is_no_coupon boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ecom_assert_access();
  RETURN QUERY
  (SELECT upper(c), count(*), sum(o.net_product_revenue), round(avg(o.net_product_revenue), 2), false
   FROM orders o, unnest(o.coupon_codes) c
   WHERE o.valid_order AND o.created_at_source >= p_from AND o.created_at_source < p_to
   GROUP BY upper(c) ORDER BY count(*) DESC, sum(o.net_product_revenue) DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 50))
  UNION ALL
  (SELECT NULL::text, count(*), COALESCE(sum(o.net_product_revenue), 0), COALESCE(round(avg(o.net_product_revenue), 2), 0), true
   FROM orders o
   WHERE o.valid_order AND o.created_at_source >= p_from AND o.created_at_source < p_to AND cardinality(o.coupon_codes) = 0);
END $$;

REVOKE ALL ON FUNCTION public.ecom_customer_key(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecom_assert_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecom_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecom_timeseries(timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecom_top_products(timestamptz, timestamptz, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecom_top_coupons(timestamptz, timestamptz, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ecom_customer_key(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ecom_assert_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ecom_summary(timestamptz, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ecom_timeseries(timestamptz, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ecom_top_products(timestamptz, timestamptz, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ecom_top_coupons(timestamptz, timestamptz, int) TO authenticated, service_role;