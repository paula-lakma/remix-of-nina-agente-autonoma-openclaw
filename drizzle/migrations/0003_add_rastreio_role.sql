ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rastreio';

CREATE OR REPLACE FUNCTION public.list_my_tracking_sends(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, order_number text, tracking_number text, carrier text, status text, created_at timestamptz, sent_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role::text = 'rastreio'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT l.id, l.order_number, l.tracking_number, l.carrier, l.status, l.created_at, l.sent_at
    FROM public.manual_tracking_logs l
    WHERE l.requested_by = auth.uid()
    ORDER BY l.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_tracking_sends(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_tracking_sends(integer) TO authenticated, service_role;