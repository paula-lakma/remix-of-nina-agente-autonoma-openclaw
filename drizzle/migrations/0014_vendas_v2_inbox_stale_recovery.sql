-- Hardening: recupera itens presos em 'processing' (claimed_at > 15 min) antes do claim normal.
CREATE OR REPLACE FUNCTION public.claim_shopify_financial_inbox(p_limit integer DEFAULT 25)
RETURNS SETOF public.shopify_financial_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- 1) stale com tentativas restantes: volta para pending (attempts não é incrementado aqui)
  UPDATE public.shopify_financial_inbox i
     SET status = 'pending', claimed_at = NULL, next_attempt_at = pg_catalog.now(),
         last_error = 'recuperado: timeout de processing (>15 min) em ' || pg_catalog.now()::text
   WHERE i.id IN (
     SELECT q.id FROM public.shopify_financial_inbox q
      WHERE q.status = 'processing'
        AND q.claimed_at < pg_catalog.now() - interval '15 minutes'
        AND q.attempts < 5
      FOR UPDATE SKIP LOCKED);

  -- 2) stale sem tentativas restantes: failed
  UPDATE public.shopify_financial_inbox i
     SET status = 'failed', claimed_at = NULL,
         last_error = 'failed: timeout de processing (>15 min) após ' || i.attempts::text || ' tentativas'
   WHERE i.id IN (
     SELECT q.id FROM public.shopify_financial_inbox q
      WHERE q.status = 'processing'
        AND q.claimed_at < pg_catalog.now() - interval '15 minutes'
        AND q.attempts >= 5
      FOR UPDATE SKIP LOCKED);

  -- 3) claim normal (inalterado)
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