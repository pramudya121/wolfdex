CREATE POLICY "logos_public_update"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'token-logos')
WITH CHECK (bucket_id = 'token-logos');