
-- Reclassify existing 'user' rows to 'sdr'
UPDATE public.user_roles SET role = 'sdr' WHERE role = 'user';

-- New signup rule: paula = admin; others = sdr
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', NEW.email);

  IF lower(NEW.email) = 'paula@lakma.com.br' THEN
    v_role := 'admin';
  ELSIF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    v_role := 'admin';
  ELSE
    v_role := 'sdr';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role);
  RETURN NEW;
END;
$function$;
