-- Tighten launchpad_tokens validation to prevent spam/abuse while keeping
-- public writes (the app is wallet-based, no Supabase auth).

CREATE OR REPLACE FUNCTION public.validate_launchpad_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- EVM address (checksum-agnostic)
  IF NEW.address !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'Invalid token address';
  END IF;
  -- Normalize to lowercase to dedupe
  NEW.address := lower(NEW.address);

  IF NEW.creator IS NOT NULL AND NEW.creator !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'Invalid creator address';
  END IF;
  IF NEW.creator IS NOT NULL THEN
    NEW.creator := lower(NEW.creator);
  END IF;

  IF char_length(NEW.name) < 1 OR char_length(NEW.name) > 64 THEN
    RAISE EXCEPTION 'Token name length must be 1-64 chars';
  END IF;
  IF char_length(NEW.symbol) < 1 OR char_length(NEW.symbol) > 16 THEN
    RAISE EXCEPTION 'Token symbol length must be 1-16 chars';
  END IF;
  IF NEW.symbol !~ '^[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Token symbol must be alphanumeric';
  END IF;
  IF NEW.decimals < 0 OR NEW.decimals > 18 THEN
    RAISE EXCEPTION 'Decimals must be 0-18';
  END IF;
  IF NEW.logo_url IS NOT NULL THEN
    IF char_length(NEW.logo_url) > 500 THEN
      RAISE EXCEPTION 'logo_url too long';
    END IF;
    IF NEW.logo_url !~* '^https://' THEN
      RAISE EXCEPTION 'logo_url must be https';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_launchpad_token_trg ON public.launchpad_tokens;
CREATE TRIGGER validate_launchpad_token_trg
BEFORE INSERT OR UPDATE ON public.launchpad_tokens
FOR EACH ROW EXECUTE FUNCTION public.validate_launchpad_token();

-- Restrict the token-logos bucket to small images only
UPDATE storage.buckets
SET file_size_limit = 524288, -- 512 KB
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/gif','image/webp']
WHERE id = 'token-logos';

-- Replace the wide-open upload policy with one that validates MIME type
DROP POLICY IF EXISTS logos_public_upload ON storage.objects;
CREATE POLICY logos_public_upload ON storage.objects
FOR INSERT TO public
WITH CHECK (
  bucket_id = 'token-logos'
  AND (lower(storage.extension(name)) IN ('png','jpg','jpeg','gif','webp'))
);
