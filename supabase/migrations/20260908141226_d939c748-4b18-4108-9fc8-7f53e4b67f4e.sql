CREATE OR REPLACE FUNCTION public.is_dermo_handoff_reason(_reason text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = 'public'
AS $$
  SELECT lower(coalesce(_reason,'')) IN (
    'technical_question','sensitive_case','contraindication','reaction','allergy',
    'pregnancy_breastfeeding','sensitized_or_injured_skin',
    'medication_or_dermatological_treatment','recent_procedure','protocol_adaptation',
    'protocol_product_substitution','missing_technical_information',
    'product_link_not_found_after_search','dermoconsultora_request'
  )
$$;