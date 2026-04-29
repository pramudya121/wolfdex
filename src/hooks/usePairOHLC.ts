import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, CHAIN_CONFIG } from '@/config/contracts';
import { PAIR_ABI } from '@/config/abis';

/**
 * Per-pair OHLC candles built from the pair's `Swap` events.
 *
 * Strategy:
 *  1. Read the last LOOKBACK_BLOCKS worth of Swap events from the pair.
 *  2. For each swap, derive the EFFECTIVE PRICE of token0 in token1
 *     (or vice-versa, depending on `invert`) from the in/out amounts.
 *  3. Bucket prices by `interval` (seconds) using the block timestamp
 *     and aggregate {open, high, low, close, volume}.
 *  4. Cache the result in localStorage for 90s so chart re-opens are
 *     instant.
 *
 * IMPORTANT: this hook does NOT spam the RPC — it fetches once on mount
 * (or on `refresh()`) and reuses the cache otherwise. Block timestamps
 * are batched in chunks of 10 to keep the page snappy.
 */

export interface Candle {
  t: number;          // unix seconds (bucket start)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;     // in token1 units (the "quote" token)
}

const LOOKBACK_BLOCKS = 8000;
const CACHE_TTL = 90_000;

interface CacheEntry {
  candles: Candle[];
  fetchedAt: number;
  pair: string;
  interval: number;
  invert: boolean;
}

function cacheKey(pair: string, interval: number, invert: boolean) {
  return `wolfdex.ohlc.${pair.toLowerCase()}.${interval}.${invert ? '1' : '0'}.v1`;
}

function readCache(pair: string, interval: number, invert: boolean): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(pair, interval, invert));
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheEntry;
    if (Date.now() - c.fetchedAt > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}
function writeCache(c: CacheEntry) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(cacheKey(c.pair, c.interval, c.invert), JSON.stringify(c)); } catch { /* quota */ }
}

export function usePairOHLC(
  pairAddress: string | null,
  options?: { interval?: number; invert?: boolean; lookback?: number },
) {
  const interval = options?.interval ?? 3600;          // 1h candles by default
  const invert = options?.invert ?? false;
  const lookback = options?.lookback ?? LOOKBACK_BLOCKS;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestBlock, setLatestBlock] = useState(0);
  const [fetchedAt, setFetchedAt] = useState(0);

  const fetchOnce = useCallback(async (force = false) => {
    if (!pairAddress) return;
    if (!force) {
      const c = readCache(pairAddress, interval, invert);
      if (c) { setCandles(c.candles); setFetchedAt(c.fetchedAt); return; }
    }
    setLoading(true); setError(null);
    try {
      const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      const head = await provider.getBlockNumber();
      const from = Math.max(0, head - lookback);
      const filter = pair.filters.Swap();
      const logs = await pair.queryFilter(filter, from, head);
      if (logs.length === 0) {
        setCandles([]);
        writeCache({ candles: [], fetchedAt: Date.now(), pair: pairAddress, interval, invert });
        setLatestBlock(head);
        return;
      }
      // Batch block timestamp lookups (10 at a time) — most RPCs are
      // fast for getBlock but we still avoid serial waterfalls.
      const blockNums = Array.from(new Set(logs.map(l => l.blockNumber)));
      const tsMap = new Map<number, number>();
      const CHUNK = 10;
      for (let i = 0; i < blockNums.length; i += CHUNK) {
        const slice = blockNums.slice(i, i + CHUNK);
        const blocks = await Promise.all(slice.map(b => provider.getBlock(b).catch(() => null)));
        slice.forEach((b, idx) => {
          if (blocks[idx]) tsMap.set(b, blocks[idx]!.timestamp);
        });
      }

      // Build per-swap price points
      type PricePoint = { t: number; price: number; vol: number };
      const points: PricePoint[] = [];
      for (const log of logs) {
        const ts = tsMap.get(log.blockNumber);
        if (!ts) continue;
        const a0In = log.args!.amount0In as ethers.BigNumber;
        const a1In = log.args!.amount1In as ethers.BigNumber;
        const a0Out = log.args!.amount0Out as ethers.BigNumber;
        const a1Out = log.args!.amount1Out as ethers.BigNumber;
        // Net token0 / token1 movement: positive = into pool
        const t0 = parseFloat(ethers.utils.formatEther(a0In.sub(a0Out)));
        const t1 = parseFloat(ethers.utils.formatEther(a1In.sub(a1Out)));
        if (t0 === 0 || t1 === 0) continue;
        // price of token0 in token1: -t1/t0 if direction reverses, magnitude is what we want
        const price = Math.abs(t1) / Math.abs(t0);
        const final = invert ? (price === 0 ? 0 : 1 / price) : price;
        const vol = invert ? Math.abs(t0) : Math.abs(t1);
        if (!isFinite(final) || final <= 0) continue;
        points.push({ t: ts, price: final, vol });
      }

      // Bucket into candles
      const buckets = new Map<number, PricePoint[]>();
      for (const p of points) {
        const bucket = Math.floor(p.t / interval) * interval;
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket)!.push(p);
      }
      const out: Candle[] = [];
      const sortedBuckets = [...buckets.keys()].sort((a, b) => a - b);
      for (const b of sortedBuckets) {
        const pts = buckets.get(b)!.sort((a, b) => a.t - b.t);
        const open = pts[0].price;
        const close = pts[pts.length - 1].price;
        let high = open, low = open, vol = 0;
        for (const p of pts) {
          if (p.price > high) high = p.price;
          if (p.price < low) low = p.price;
          vol += p.vol;
        }
        out.push({ t: b, open, high, low, close, volume: vol });
      }
      setCandles(out);
      setLatestBlock(head);
      writeCache({ candles: out, fetchedAt: Date.now(), pair: pairAddress, interval, invert });
    } catch (e: any) {
      setError(e?.message || 'Failed to load price history');
    } finally {
      setLoading(false);
    }
  }, [pairAddress, interval, invert, lookback]);

  // When pair/interval/invert changes, clear stale candles before refetch
  // so the chart shows a clean loading state instead of mismatched data.
  useEffect(() => {
    setCandles([]);
    fetchOnce(false);
  }, [fetchOnce]);

  return { candles, loading, error, latestBlock, refresh: () => fetchOnce(true) };
}