DROP POLICY IF EXISTS "Authenticated access contact_lists" ON public.contact_lists;
DROP POLICY IF EXISTS "Authenticated access contact_list_members" ON public.contact_list_members;
DROP POLICY IF EXISTS "Authenticated access broadcast_campaigns" ON public.broadcast_campaigns;
DROP POLICY IF EXISTS "Authenticated access broadcast_recipients" ON public.broadcast_recipients;
DROP POLICY IF EXISTS "Authenticated access message_templates" ON public.message_templates;
DROP POLICY IF EXISTS "Authenticated access meta_templates" ON public.meta_templates;

CREATE POLICY "contact_lists_select_admin" ON public.contact_lists FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_lists_insert_admin" ON public.contact_lists FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_lists_update_admin" ON public.contact_lists FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_lists_delete_admin" ON public.contact_lists FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "contact_list_members_select_admin" ON public.contact_list_members FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_list_members_insert_admin" ON public.contact_list_members FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_list_members_update_admin" ON public.contact_list_members FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "contact_list_members_delete_admin" ON public.contact_list_members FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "broadcast_campaigns_select_admin" ON public.broadcast_campaigns FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_campaigns_insert_admin" ON public.broadcast_campaigns FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_campaigns_update_admin" ON public.broadcast_campaigns FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_campaigns_delete_admin" ON public.broadcast_campaigns FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "broadcast_recipients_select_admin" ON public.broadcast_recipients FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_recipients_insert_admin" ON public.broadcast_recipients FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_recipients_update_admin" ON public.broadcast_recipients FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcast_recipients_delete_admin" ON public.broadcast_recipients FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "message_templates_select_admin" ON public.message_templates FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "message_templates_insert_admin" ON public.message_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "message_templates_update_admin" ON public.message_templates FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "message_templates_delete_admin" ON public.message_templates FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "meta_templates_select_admin" ON public.meta_templates FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "meta_templates_insert_admin" ON public.meta_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "meta_templates_update_admin" ON public.meta_templates FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "meta_templates_delete_admin" ON public.meta_templates FOR DELETE TO authenticated USING (public.is_admin_or_manager(auth.uid()));

REVOKE ALL ON public.contact_lists FROM anon;
REVOKE ALL ON public.contact_list_members FROM anon;
REVOKE ALL ON public.broadcast_campaigns FROM anon;
REVOKE ALL ON public.broadcast_recipients FROM anon;
REVOKE ALL ON public.message_templates FROM anon;
REVOKE ALL ON public.meta_templates FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_list_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_recipients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_templates TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
GRANT ALL ON public.contact_list_members TO service_role;
GRANT ALL ON public.broadcast_campaigns TO service_role;
GRANT ALL ON public.broadcast_recipients TO service_role;
GRANT ALL ON public.message_templates TO service_role;
GRANT ALL ON public.meta_templates TO service_role;