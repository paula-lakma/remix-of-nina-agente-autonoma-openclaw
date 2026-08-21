DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'financeiro@lakma.com.br';
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Conta financeiro@lakma.com.br nao encontrada';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_uid AND role <> 'expedicao';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'expedicao')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;