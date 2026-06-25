
CREATE POLICY "Authenticated can read whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Service role manages whatsapp media"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');
