ALTER TABLE public.team_functions DROP CONSTRAINT IF EXISTS team_functions_name_key;
ALTER TABLE public.team_functions ADD CONSTRAINT team_functions_user_name_unique UNIQUE (user_id, name);

DROP POLICY IF EXISTS "Authenticated read messages" ON public.messages;
DROP POLICY IF EXISTS "Authenticated write messages" ON public.messages;
CREATE POLICY "Users access messages of own conversations" ON public.messages FOR ALL
USING (EXISTS (SELECT 1 FROM public.conversations WHERE id = messages.conversation_id AND user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.conversations WHERE id = messages.conversation_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated all conversation_states" ON public.conversation_states;
CREATE POLICY "Users access states of own conversations" ON public.conversation_states FOR ALL
USING (EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_states.conversation_id AND user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.conversations WHERE id = conversation_states.conversation_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Auth all deal_activities" ON public.deal_activities;
CREATE POLICY "Users access activities of own deals" ON public.deal_activities FOR ALL
USING (EXISTS (SELECT 1 FROM public.deals WHERE id = deal_activities.deal_id AND user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.deals WHERE id = deal_activities.deal_id AND user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_stage_id UUID;
BEGIN
  SELECT id INTO first_stage_id FROM public.pipeline_stages
   WHERE is_active = true AND (user_id = NEW.user_id OR user_id IS NULL)
   ORDER BY position LIMIT 1;
  IF first_stage_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.deals (contact_id, title, company, stage, stage_id, priority, user_id)
  VALUES (NEW.id, COALESCE(NEW.name, NEW.call_name, 'Novo Lead'), NULL, 'new', first_stage_id, 'medium', NEW.user_id);
  RETURN NEW;
END; $$;

ALTER TABLE public.nina_settings ALTER COLUMN elevenlabs_voice_id SET DEFAULT '33B4UnXyTNbgLmdEDh5P';

DO $$
DECLARE admin_user_id UUID; old_stage_id UUID; new_stage_id UUID;
BEGIN
  SELECT user_id INTO admin_user_id FROM public.user_roles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF admin_user_id IS NOT NULL THEN
    UPDATE public.nina_settings SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.contacts SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.conversations SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.appointments SET user_id = admin_user_id WHERE user_id IS NULL;
    FOR old_stage_id, new_stage_id IN
      SELECT orphan.id, admin_stage.id FROM public.pipeline_stages orphan
      JOIN public.pipeline_stages admin_stage ON orphan.position = admin_stage.position AND admin_stage.user_id = admin_user_id
      WHERE orphan.user_id IS NULL
    LOOP UPDATE public.deals SET stage_id = new_stage_id WHERE stage_id = old_stage_id; END LOOP;
    DELETE FROM public.pipeline_stages WHERE user_id IS NULL AND position IN (SELECT position FROM public.pipeline_stages WHERE user_id = admin_user_id);
    UPDATE public.pipeline_stages SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.deals SET user_id = admin_user_id WHERE user_id IS NULL;
    DELETE FROM public.tag_definitions WHERE user_id IS NULL AND key IN (SELECT key FROM public.tag_definitions WHERE user_id = admin_user_id);
    UPDATE public.tag_definitions SET user_id = admin_user_id WHERE user_id IS NULL;
    DELETE FROM public.teams WHERE user_id IS NULL AND name IN (SELECT name FROM public.teams WHERE user_id = admin_user_id);
    UPDATE public.teams SET user_id = admin_user_id WHERE user_id IS NULL;
    DELETE FROM public.team_functions WHERE user_id IS NULL AND name IN (SELECT name FROM public.team_functions WHERE user_id = admin_user_id);
    UPDATE public.team_functions SET user_id = admin_user_id WHERE user_id IS NULL;
    UPDATE public.team_members SET user_id = admin_user_id WHERE user_id IS NULL;
  END IF;
END $$;

DELETE FROM public.nina_settings a USING public.nina_settings b
WHERE a.user_id = b.user_id AND a.user_id IS NOT NULL AND a.created_at < b.created_at;
ALTER TABLE public.nina_settings ADD CONSTRAINT nina_settings_user_id_unique UNIQUE (user_id);

ALTER TABLE public.message_grouping_queue ADD COLUMN IF NOT EXISTS process_after TIMESTAMPTZ DEFAULT (now() + interval '20 seconds');
CREATE INDEX IF NOT EXISTS idx_message_grouping_ready ON public.message_grouping_queue (process_after, processed) WHERE processed = false;
ALTER TABLE public.message_grouping_queue ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id);
CREATE INDEX IF NOT EXISTS idx_message_grouping_queue_message_id ON public.message_grouping_queue(message_id);

DROP POLICY IF EXISTS "Users access messages of own conversations" ON public.messages;
DROP POLICY IF EXISTS "Users manage own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users manage own contacts" ON public.contacts;
CREATE POLICY "Authenticated users access all messages" ON public.messages FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users access all conversations" ON public.conversations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users access all contacts" ON public.contacts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

CREATE UNIQUE INDEX IF NOT EXISTS messages_whatsapp_message_id_unique ON public.messages (whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;
UPDATE public.message_grouping_queue SET processed = true WHERE processed = false AND process_after < now();
DELETE FROM public.message_grouping_queue WHERE processed = true AND created_at < now() - interval '1 hour';
DELETE FROM public.nina_processing_queue WHERE status = 'failed' AND updated_at < now() - interval '24 hours';
DELETE FROM public.send_queue WHERE status = 'failed' AND updated_at < now() - interval '24 hours';

DELETE FROM public.pipeline_stages WHERE user_id IS NULL;
DELETE FROM public.tag_definitions WHERE user_id IS NULL;
DELETE FROM public.nina_settings WHERE user_id IS NULL;
DELETE FROM public.teams WHERE user_id IS NULL;
DELETE FROM public.team_functions WHERE user_id IS NULL;

DO $$ DECLARE keep_id UUID;
BEGIN
  SELECT id INTO keep_id FROM public.nina_settings
  ORDER BY CASE WHEN company_name IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN whatsapp_access_token IS NOT NULL THEN 0 ELSE 1 END, CASE WHEN system_prompt_override IS NOT NULL THEN 0 ELSE 1 END, updated_at DESC LIMIT 1;
  IF keep_id IS NOT NULL THEN DELETE FROM public.nina_settings WHERE id != keep_id; END IF;
END $$;

UPDATE public.nina_settings SET user_id = NULL;
UPDATE public.pipeline_stages SET user_id = NULL;
DELETE FROM public.tag_definitions a USING public.tag_definitions b WHERE a.id > b.id AND a.key = b.key;
UPDATE public.tag_definitions SET user_id = NULL;
DELETE FROM public.teams a USING public.teams b WHERE a.id > b.id AND a.name = b.name;
UPDATE public.teams SET user_id = NULL;
DELETE FROM public.team_functions a USING public.team_functions b WHERE a.id > b.id AND a.name = b.name;
UPDATE public.team_functions SET user_id = NULL;

DROP POLICY IF EXISTS "Users manage own nina_settings" ON public.nina_settings;
CREATE POLICY "Authenticated read nina_settings" ON public.nina_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify nina_settings" ON public.nina_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own pipeline_stages" ON public.pipeline_stages;
CREATE POLICY "Authenticated read pipeline_stages" ON public.pipeline_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify pipeline_stages" ON public.pipeline_stages FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own tag_definitions" ON public.tag_definitions;
CREATE POLICY "Authenticated read tag_definitions" ON public.tag_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify tag_definitions" ON public.tag_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own teams" ON public.teams;
CREATE POLICY "Authenticated read teams" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify teams" ON public.teams FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own team_functions" ON public.team_functions;
CREATE POLICY "Authenticated read team_functions" ON public.team_functions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify team_functions" ON public.team_functions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users manage own team_members" ON public.team_members;
CREATE POLICY "Authenticated read team_members" ON public.team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins modify team_members" ON public.team_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.teams; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_functions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.team_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;