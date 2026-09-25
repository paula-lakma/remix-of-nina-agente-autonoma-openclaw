DROP POLICY IF EXISTS crm_notes_select ON public.crm_notes;
CREATE POLICY crm_notes_select ON public.crm_notes FOR SELECT TO authenticated
  USING (public.is_operational_staff(auth.uid()));