-- A. Backup privado
CREATE SCHEMA IF NOT EXISTS pipeline_backup;
REVOKE ALL ON SCHEMA pipeline_backup FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA pipeline_backup TO service_role;
CREATE TABLE pipeline_backup.deals_20260924 AS SELECT d.*, false AS kept, now() AS backed_up_at FROM public.deals d;
REVOKE ALL ON pipeline_backup.deals_20260924 FROM PUBLIC, anon, authenticated;
GRANT ALL ON pipeline_backup.deals_20260924 TO service_role;
ALTER TABLE pipeline_backup.deals_20260924 ENABLE ROW LEVEL SECURITY;

-- C. Chaves canônicas das etapas
CREATE OR REPLACE FUNCTION public.pipeline_stage_id(_key text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _key
    WHEN 'new' THEN '0b66348b-527d-472a-8c49-8bc347d1b61e'::uuid
    WHEN 'human_handoff' THEN '5bcf84cf-3f60-4120-8a79-c5ea9d4bc446'::uuid
    WHEN 'attendance_finished' THEN 'd690781b-4bd3-4d97-beb4-7c7cfc5ce0bb'::uuid
  END
$$;

-- Dedupe: card canônico + etapa por evidência real
CREATE TEMP TABLE _ev ON COMMIT DROP AS
SELECT ct.id AS contact_id,
  (SELECT v.assigned_user_id FROM public.conversations v
     WHERE v.contact_id = ct.id AND v.is_active AND v.assigned_user_id IS NOT NULL
       AND NOT v.attendance_finished AND (v.ai_paused OR v.human_takeover_required OR v.handoff_type IS NOT NULL)
       AND EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.id = v.assigned_user_id)
     ORDER BY v.last_message_at DESC LIMIT 1) AS active_owner,
  EXISTS (SELECT 1 FROM public.conversations v
     WHERE v.contact_id = ct.id AND v.is_active AND v.assigned_user_id IS NOT NULL
       AND NOT v.attendance_finished AND (v.ai_paused OR v.human_takeover_required OR v.handoff_type IS NOT NULL)) AS active_h,
  (SELECT max(e.created_at) FROM public.conversation_handoff_events e JOIN public.conversations v ON v.id = e.conversation_id
     WHERE v.contact_id = ct.id AND e.event_type = 'attendance_finished') AS fin,
  (SELECT max(e.created_at) FROM public.conversation_handoff_events e JOIN public.conversations v ON v.id = e.conversation_id
     WHERE v.contact_id = ct.id AND e.event_type IN ('reopened_by_message','nina_reactivated')) AS reop
FROM public.contacts ct;

CREATE TEMP TABLE _canon ON COMMIT DROP AS
SELECT DISTINCT ON (d.contact_id) d.id, d.contact_id,
  CASE WHEN ev.active_h THEN 'human_handoff'
       WHEN ev.fin IS NOT NULL AND (ev.reop IS NULL OR ev.reop < ev.fin) THEN 'attendance_finished'
       ELSE 'new' END AS stage_key,
  CASE WHEN ev.active_h THEN ev.active_owner END AS owner
FROM public.deals d JOIN _ev ev ON ev.contact_id = d.contact_id
ORDER BY d.contact_id,
  (ev.active_h AND d.owner_id IS NOT NULL) DESC,
  d.created_at ASC, d.id ASC;

UPDATE pipeline_backup.deals_20260924 b SET kept = true FROM _canon c WHERE c.id = b.id;

UPDATE public.deals d SET stage_id = public.pipeline_stage_id(c.stage_key), stage = c.stage_key, owner_id = c.owner
FROM _canon c WHERE c.id = d.id;

DELETE FROM public.deals d WHERE d.contact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM _canon c WHERE c.id = d.id);

-- Gatilho duplicado
DROP TRIGGER IF EXISTS auto_create_deal_on_contact_trigger ON public.contacts;
COMMENT ON FUNCTION public.auto_create_deal_on_contact() IS 'DEPRECATED: gatilho removido em 2026-09-24 (duplicava cards). Use create_deal_for_new_contact.';

-- 1 card ativo por contato
CREATE UNIQUE INDEX IF NOT EXISTS deals_one_active_per_contact
  ON public.deals (contact_id) WHERE won_at IS NULL AND lost_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.deals (contact_id, title, company, stage, stage_id, priority, user_id)
  VALUES (NEW.id, COALESCE(NEW.name, NEW.call_name, 'Novo Lead'), NULL, 'new', public.pipeline_stage_id('new'), 'medium', NEW.user_id)
  ON CONFLICT (contact_id) WHERE won_at IS NULL AND lost_at IS NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- Sincronização do card a partir de eventos reais
CREATE OR REPLACE FUNCTION public.sync_deal_from_handoff_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _contact uuid; _owner uuid;
BEGIN
  SELECT contact_id, assigned_user_id INTO _contact, _owner FROM public.conversations WHERE id = NEW.conversation_id;
  IF _contact IS NULL THEN RETURN NEW; END IF;

  IF NEW.event_type IN ('handoff_financeiro','handoff_expedicao_manual','handoff_dermoconsultant','handoff_parcerias','handoff_comercial') THEN
    UPDATE public.deals SET stage_id = public.pipeline_stage_id('human_handoff'), stage = 'human_handoff',
      owner_id = CASE WHEN EXISTS (SELECT 1 FROM public.team_members WHERE id = _owner) THEN _owner ELSE owner_id END
    WHERE contact_id = _contact AND won_at IS NULL AND lost_at IS NULL;
  ELSIF NEW.event_type = 'attendance_finished' THEN
    UPDATE public.deals SET stage_id = public.pipeline_stage_id('attendance_finished'), stage = 'attendance_finished', owner_id = NULL
    WHERE contact_id = _contact AND won_at IS NULL AND lost_at IS NULL;
  ELSIF NEW.event_type IN ('nina_reactivated','reopened_by_message') THEN
    UPDATE public.deals SET owner_id = NULL,
      stage_id = CASE WHEN stage_id IN (public.pipeline_stage_id('human_handoff'), public.pipeline_stage_id('attendance_finished'))
                      THEN public.pipeline_stage_id('new') ELSE stage_id END,
      stage = CASE WHEN stage_id IN (public.pipeline_stage_id('human_handoff'), public.pipeline_stage_id('attendance_finished'))
                   THEN 'new' ELSE stage END
    WHERE contact_id = _contact AND won_at IS NULL AND lost_at IS NULL;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS sync_deal_from_handoff_event ON public.conversation_handoff_events;
CREATE TRIGGER sync_deal_from_handoff_event AFTER INSERT ON public.conversation_handoff_events
  FOR EACH ROW EXECUTE FUNCTION public.sync_deal_from_handoff_event();