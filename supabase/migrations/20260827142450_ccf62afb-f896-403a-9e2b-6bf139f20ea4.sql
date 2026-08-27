UPDATE public.messages m
SET metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object(
  'media_path',
  regexp_replace(split_part(m.media_url, '?', 1), '^.*/whatsapp-media/', '')
)
WHERE m.type <> 'text'
  AND m.media_url IS NOT NULL
  AND m.media_url LIKE '%/whatsapp-media/%'
  AND NOT (coalesce(m.metadata, '{}'::jsonb) ? 'media_path');