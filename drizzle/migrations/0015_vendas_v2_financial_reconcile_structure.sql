-- Vendas V2 Passo 6 Etapa A: estrutura (sem linhas) para reconciliação financeira.
CREATE TABLE public.financial_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  run_id text NOT NULL,
  mode text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','continuation','failed','busy')),
  counters jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.financial_job_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.financial_job_runs TO service_role;
ALTER TABLE public.financial_job_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX financial_job_runs_job_started_idx ON public.financial_job_runs (job_name, started_at DESC);
CREATE TRIGGER financial_job_runs_updated_at BEFORE UPDATE ON public.financial_job_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.financial_job_state (
  job_name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','continuation')),
  window_start timestamptz,
  window_end timestamptz,
  cursor text,
  last_completed_window_end timestamptz,
  locked_by text,
  locked_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.financial_job_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.financial_job_state TO service_role;
ALTER TABLE public.financial_job_state ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER financial_job_state_updated_at BEFORE UPDATE ON public.financial_job_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Lease durável: aquisição atômica (só se livre ou expirado).
CREATE OR REPLACE FUNCTION public.acquire_financial_job_lease(p_job_name text, p_run_id text, p_ttl_seconds integer DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_ok boolean;
BEGIN
  IF COALESCE(p_job_name,'') = '' OR COALESCE(p_run_id,'') = '' THEN RAISE EXCEPTION 'lease: parâmetros inválidos'; END IF;
  INSERT INTO public.financial_job_state AS s (job_name, status, locked_by, locked_at, locked_until)
  VALUES (p_job_name, 'idle', p_run_id, pg_catalog.now(),
          pg_catalog.now() + pg_catalog.make_interval(secs => LEAST(GREATEST(COALESCE(p_ttl_seconds,600),30),3600)))
  ON CONFLICT (job_name) DO UPDATE
     SET locked_by = EXCLUDED.locked_by, locked_at = EXCLUDED.locked_at, locked_until = EXCLUDED.locked_until
   WHERE s.locked_until IS NULL OR s.locked_until < pg_catalog.now()
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END; $$;

CREATE OR REPLACE FUNCTION public.renew_financial_job_lease(p_job_name text, p_run_id text, p_ttl_seconds integer DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.financial_job_state s
     SET locked_until = pg_catalog.now() + pg_catalog.make_interval(secs => LEAST(GREATEST(COALESCE(p_ttl_seconds,600),30),3600))
   WHERE s.job_name = p_job_name AND s.locked_by = p_run_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END; $$;

CREATE OR REPLACE FUNCTION public.release_financial_job_lease(p_job_name text, p_run_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n integer;
BEGIN
  UPDATE public.financial_job_state s
     SET locked_by = NULL, locked_at = NULL, locked_until = NULL
   WHERE s.job_name = p_job_name AND s.locked_by = p_run_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END; $$;

-- Gatilhos internos (sem agendamento nesta etapa). Segredos só via Vault.
CREATE OR REPLACE FUNCTION public.trigger_financials_worker()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_url text := pg_catalog.rtrim(COALESCE(public.get_secret('SUPABASE_URL'), ''), '/');
  v_token text := COALESCE(public.get_secret('PANEL_TOKEN'), '');
BEGIN
  IF v_url = '' OR v_token = '' THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shopify_financial_inbox i
     WHERE (i.status = 'pending' AND i.next_attempt_at <= pg_catalog.now())
        OR (i.status = 'processing' AND i.claimed_at < pg_catalog.now() - interval '15 minutes')
  ) THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/shopify-financials-worker',
    headers := pg_catalog.jsonb_build_object('Content-Type','application/json','X-Panel-Token', v_token),
    body := pg_catalog.jsonb_build_object('triggered_by','cron')
  );
END; $$;

CREATE OR REPLACE FUNCTION public.trigger_financials_reconcile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_url text := pg_catalog.rtrim(COALESCE(public.get_secret('SUPABASE_URL'), ''), '/');
  v_token text := COALESCE(public.get_secret('PANEL_TOKEN'), '');
BEGIN
  IF v_url = '' OR v_token = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/shopify-financials-reconcile',
    headers := pg_catalog.jsonb_build_object('Content-Type','application/json','X-Panel-Token', v_token),
    body := pg_catalog.jsonb_build_object('mode','scheduled','triggered_by','cron')
  );
END; $$;

REVOKE EXECUTE ON FUNCTION public.acquire_financial_job_lease(text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_financial_job_lease(text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_financial_job_lease(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_financials_worker() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_financials_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_financial_job_lease(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_financial_job_lease(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_financial_job_lease(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_financials_worker() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_financials_reconcile() TO service_role;