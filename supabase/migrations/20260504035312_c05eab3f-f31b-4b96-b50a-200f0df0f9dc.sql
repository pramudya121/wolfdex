
-- Public registry of launchpad tokens (logo + metadata) so they appear for everyone on every page.
CREATE TABLE public.launchpad_tokens (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INT NOT NULL DEFAULT 18,
  logo_url TEXT,
  creator TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.launchpad_tokens ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public registry)
CREATE POLICY "tokens_public_read" ON public.launchpad_tokens
  FOR SELECT USING (true);

-- Anyone can insert a new token entry (the address is verified on-chain by the launchpad contract)
CREATE POLICY "tokens_public_insert" ON public.launchpad_tokens
  FOR INSERT WITH CHECK (true);

-- Public storage bucket for logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('token-logos', 'token-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'token-logos');

CREATE POLICY "logos_public_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'token-logos');
