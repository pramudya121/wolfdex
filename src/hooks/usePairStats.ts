/**
 * usePairStats — rolling 24h market stats for a pair, derived from the
 * same hourly OHLC candles the chart already indexes (shared localStorage
 * cache ⇒ no extra RPC traffic).
 */
import { useMemo } from 'react';
import { usePairOHLC, type Candle } from './usePairOHLC';

export interface PairStats24h {
  volume: number;      // quote-token volume over the window
  high: number;
  low: number;
  open: number;
  close: number;
  change: number;      // percent
  candles: number;     // buckets inside the window
  loading: boolean;
}

export function deriveStats24h(candles: Candle[], windowSeconds = 86_400): PairStats24h {
  const empty: PairStats24h = {
    volume: 0, high: 0, low: 0, open: 0, close: 0, change: 0, candles: 0, loading: false,
  };
  if (candles.length === 0) return empty;
  const last = candles[candles.length - 1];
  const cutoff = last.t - windowSeconds;
  const win = candles.filter(c => c.t >= cutoff);
  if (win.length === 0) return empty;

  let high = win[0].high;
  let low = win[0].low;
  let volume = 0;
  for (const c of win) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    volume += c.volume;
  }
  const open = win[0].open;
  const close = win[win.length - 1].close;
  return {
    volume,
    high,
    low,
    open,
    close,
    change: open > 0 ? ((close - open) / open) * 100 : 0,
    candles: win.length,
    loading: false,
  };
}

export function usePairStats(pairAddress: string | null, invert = false): PairStats24h {
  // interval 3600 matches PairChart's default, so this reuses its cache entry.
  const { candles, loading } = usePairOHLC(pairAddress, { interval: 3600, invert });
  return useMemo(() => ({ ...deriveStats24h(candles), loading }), [candles, loading]);
}
