CREATE TABLE public.domain_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_name text NOT NULL,
  email text NOT NULL,
  wallet_address text,
  message text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT INSERT ON public.domain_requests TO anon;
GRANT INSERT ON public.domain_requests TO authenticated;
GRANT ALL ON public.domain_requests TO service_role;

ALTER TABLE public.domain_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domain_requests_public_insert"
ON public.domain_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  char_length(domain_name) BETWEEN 3 AND 63
  AND domain_name ~ '^[a-z0-9-]+$'
  AND char_length(email) BETWEEN 5 AND 255
  AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-fA-F]{40}$')
  AND (message IS NULL OR char_length(message) <= 1000)
  AND status = 'new'
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_domain_requests_updated_at
BEFORE UPDATE ON public.domain_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();