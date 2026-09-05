CREATE TABLE public.aggregator_routers (
  address text PRIMARY KEY,
  label text NOT NULL DEFAULT 'External Router',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.aggregator_routers TO anon;
GRANT SELECT ON public.aggregator_routers TO authenticated;
GRANT ALL ON public.aggregator_routers TO service_role;
ALTER TABLE public.aggregator_routers ENABLE ROW LEVEL SECURITY;
CREATE POLICY routers_public_read ON public.aggregator_routers FOR SELECT USING (true);