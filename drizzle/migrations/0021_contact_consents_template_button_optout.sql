ALTER TABLE public.contact_consents DROP CONSTRAINT contact_consents_source_check;
ALTER TABLE public.contact_consents ADD CONSTRAINT contact_consents_source_check
  CHECK (source IN ('shopify_site','nina','whatsapp_keyword','shopify','cadastro_profissional','manual','whatsapp_template_button'));
CREATE UNIQUE INDEX uq_contact_consents_button_inbound
  ON public.contact_consents ((evidence->>'inbound_message_id'))
  WHERE source = 'whatsapp_template_button';
ALTER TABLE public.contact_consents ADD CONSTRAINT contact_consents_button_is_optout
  CHECK (source <> 'whatsapp_template_button' OR (status = 'opted_out' AND evidence ? 'inbound_message_id'));