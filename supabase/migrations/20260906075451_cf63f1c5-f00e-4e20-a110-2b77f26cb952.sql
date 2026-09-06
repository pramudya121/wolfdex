CREATE TABLE public.ecosystem_dapps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  logo_url text,
  description text,
  category text NOT NULL DEFAULT 'DeFi',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ecosystem_dapps TO anon;
GRANT SELECT ON public.ecosystem_dapps TO authenticated;
GRANT ALL ON public.ecosystem_dapps TO service_role;

ALTER TABLE public.ecosystem_dapps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecosystem_public_read" ON public.ecosystem_dapps FOR SELECT USING (true);

CREATE TRIGGER update_ecosystem_dapps_updated_at
BEFORE UPDATE ON public.ecosystem_dapps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();