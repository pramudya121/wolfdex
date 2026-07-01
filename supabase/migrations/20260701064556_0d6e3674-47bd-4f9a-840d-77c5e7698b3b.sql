
CREATE OR REPLACE FUNCTION public.validate_launchpad_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.address !~ '^0x[0-9a-fA-F]{40}$' THEN
    RAISE EXCEPTION 'Invalid token address';
  END IF;
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

  -- Prevent privilege escalation: anon/authenticated callers cannot
  -- self-assign the Verified badge. Only service_role (privileged
  -- curation) may set verified=true.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND auth.role() <> 'service_role' THEN
    NEW.verified := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_launchpad_token_trg ON public.launchpad_tokens;
CREATE TRIGGER validate_launchpad_token_trg
BEFORE INSERT OR UPDATE ON public.launchpad_tokens
FOR EACH ROW EXECUTE FUNCTION public.validate_launchpad_token();
