-- Market metrics cache: lets the Market page and token detail pages
-- render instantly from cached on-chain metrics and share updates in realtime.
CREATE TABLE public.market_metrics (
  token_address TEXT PRIMARY KEY,
  pair_address  TEXT,
  price         NUMERIC NOT NULL DEFAULT 0 CHECK (price >= 0),
  price_usd     NUMERIC NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  liquidity     NUMERIC NOT NULL DEFAULT 0 CHECK (liquidity >= 0),
  liquidity_usd NUMERIC NOT NULL DEFAULT 0 CHECK (liquidity_usd >= 0),
  change_24h    NUMERIC NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_metrics TO anon;
GRANT SELECT, INSERT, UPDATE ON public.market_metrics TO authenticated;
GRANT ALL ON public.market_metrics TO service_role;

ALTER TABLE public.market_metrics ENABLE ROW LEVEL SECURITY;

-- Everyone may read the cache.
CREATE POLICY "market_metrics_public_read"
  ON public.market_metrics FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes are validated: well-formed EVM addresses, non-negative values.
CREATE POLICY "market_metrics_public_insert"
  ON public.market_metrics FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    token_address ~ '^0x[0-9a-fA-F]{40}$'
    AND (pair_address IS NULL OR pair_address ~ '^0x[0-9a-fA-F]{40}$')
    AND price >= 0 AND price_usd >= 0 AND liquidity >= 0 AND liquidity_usd >= 0
  );

CREATE POLICY "market_metrics_public_update"
  ON public.market_metrics FOR UPDATE
  TO anon, authenticated
  USING (token_address ~ '^0x[0-9a-fA-F]{40}$')
  WITH CHECK (
    token_address ~ '^0x[0-9a-fA-F]{40}$'
    AND (pair_address IS NULL OR pair_address ~ '^0x[0-9a-fA-F]{40}$')
    AND price >= 0 AND price_usd >= 0 AND liquidity >= 0 AND liquidity_usd >= 0
  );

CREATE INDEX market_metrics_updated_at_idx ON public.market_metrics (updated_at DESC);

-- Realtime: instant cross-visitor updates.
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_metrics;