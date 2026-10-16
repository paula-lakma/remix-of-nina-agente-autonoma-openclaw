CREATE UNIQUE INDEX IF NOT EXISTS messages_client_request_id_uidx
  ON public.messages ((metadata->>'client_request_id'))
  WHERE metadata ? 'client_request_id';