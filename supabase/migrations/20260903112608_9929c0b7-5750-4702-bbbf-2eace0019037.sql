CREATE OR REPLACE FUNCTION public.pick_dermo_assignee(_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_laura uuid;
BEGIN
  IF public.is_sensitive_dermo_reason(_reason) THEN
    SELECT tm.id INTO v_laura
    FROM public.team_members tm
    WHERE lower(tm.email) IN ('lauralakma@outlook.com','lakma.vendas5@gmail.com')
      AND tm.status = 'active'
    ORDER BY tm.created_at ASC LIMIT 1;
    IF v_laura IS NOT NULL THEN
      RETURN jsonb_build_object('team_member_id', v_laura, 'mode', 'sensitive_direct', 'fallback', false);
    END IF;
    RETURN jsonb_build_object('team_member_id', public.pick_next_dermoconsultora(),
                              'mode', 'sensitive_fallback', 'fallback', true,
                              'fallback_cause', 'senior_unavailable');
  END IF;
  RETURN jsonb_build_object('team_member_id', public.pick_next_dermoconsultora(),
                            'mode', 'balanced', 'fallback', false);
END;
$function$;