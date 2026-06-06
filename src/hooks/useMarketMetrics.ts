/**
 * useMarketMetrics — per-token on-chain metrics for the Market page.
 *
 * What it computes (purely from on-chain data the app already exposes):
 *   - liquidity   : sum of the token's reserve across every pair containing it
 *   - tvlProxy    : sum of (reserve0 + reserve1) across those pairs
 *   - volume24h   : token-side volume in the last `lookbackBlocks`
 *   - swaps       : number of Swap events that touched any pair with this token
 *   - priceWNative: current price in wzkLTC (from reserves of the WETH pair)
 *   - prices[]    : compact price series (vs wzkLTC) for the sparkline
 *   - change      : % delta between first and last price in the window
 *
 * Strategy (cheap on RPC):
 *   1. Pull all pairs + reserves from DexContext's cached multicall result.
 *   2. ONE chunked `eth_getLogs` for the Swap topic — filtered by the pair
 *      address list — covers every pair in the protocol.
 *   3. Aggregate logs by pair, then fold per-token.
 *   4. Cache in localStorage for 5 minutes (keyed by pair-set hash).
 */
import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { PAIR_ABI } from '@/config/abis';
import { CONTRACTS } from '@/config/contracts';
import { getReadProvider } from '@/lib/rpc';
import { useDexContext } from '@/context/DexContext';

export interface TokenMetric {
  address: string;            // lowercase
  liquidity: number;          // token units
  tvlProxy: number;           // reserve units
  volume24h: number;          // token-side volume
  swaps: number;
  priceWNative: number;       // 0 if no wzkLTC pair
  prices: number[];           // sparkline series (oldest → newest)
  change: number;             // pct change (0..n), e.g. +5.2 = +5.2%
}

const LOOKBACK_BLOCKS = 12000;         // ~6h on Caldera 2s blocks
const CHUNK = 5000;
const CACHE_TTL = 5 * 60_000;
const SWAP_TOPIC = ethers.utils.id('Swap(address,uint256,uint256,uint256,uint256,address)');
const WETH_LOWER = CONTRACTS.WETH.toLowerCase();

interface CacheEntry {
  fetchedAt: number;
  pairsHash: string;
  metrics: Record<string, TokenMetric>;
}

function cacheKey(hash: string) { return `wolfdex.market.metrics.${hash}.v1`; }
function readCache(hash: string): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(hash));
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheEntry;
    if (Date.now() - c.fetchedAt > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}
function writeCache(c: CacheEntry) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(cacheKey(c.pairsHash), JSON.stringify(c)); } catch { /* quota */ }
}

function emptyMetric(addr: string): TokenMetric {
  return {
    address: addr.toLowerCase(),
    liquidity: 0, tvlProxy: 0, volume24h: 0, swaps: 0,
    priceWNative: 0, prices: [], change: 0,
  };
}

export function useMarketMetrics() {
  const { getCachedPairsWithInfo } = useDexContext();
  const [metrics, setMetrics] = useState<Record<string, TokenMetric>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async (force = false) => {
    setError(null);
    try {
      const cache = await getCachedPairsWithInfo(false);
      const pairs = cache.pairs;
      if (pairs.length === 0) { setMetrics({}); return; }

      const pairsHash = pairs.length + '_' + pairs[0].slice(2, 10);
      if (!force) {
        const c = readCache(pairsHash);
        if (c) { setMetrics(c.metrics); return; }
      }

      // ---------------- Static aggregation from current reserves ----------------
      const out: Record<string, TokenMetric> = {};
      const ensure = (addr: string) => (out[addr.toLowerCase()] ??= emptyMetric(addr));

      // Map: pair (lower) → {token0, token1, r0, r1}
      const pairMeta = new Map<string, { t0: string; t1: string; r0: number; r1: number }>();
      for (const addr of pairs) {
        const info = cache.infos[addr];
        if (!info) continue;
        const r0 = parseFloat(info.reserve0 || '0');
        const r1 = parseFloat(info.reserve1 || '0');
        const t0 = info.token0.toLowerCase();
        const t1 = info.token1.toLowerCase();
        pairMeta.set(addr.toLowerCase(), { t0, t1, r0, r1 });

        const m0 = ensure(info.token0);
        const m1 = ensure(info.token1);
        m0.liquidity += r0; m0.tvlProxy += r0 + r1;
        m1.liquidity += r1; m1.tvlProxy += r0 + r1;

        // Current price vs wzkLTC, if this pair includes wzkLTC.
        if (t0 === WETH_LOWER && r0 > 0) {
          m1.priceWNative = r0 / r1 || 0;          // price of t1 in wzkLTC
        } else if (t1 === WETH_LOWER && r1 > 0) {
          m0.priceWNative = r1 / r0 || 0;
        }
      }

      // ---------------- Dynamic: scan Swap events for volume + sparkline ------
      setLoading(true);
      const provider = getReadProvider();
      const head = await provider.getBlockNumber();
      const fromBlock = Math.max(0, head - LOOKBACK_BLOCKS);

      // Per-pair price points (block → price of token-non-WETH in WETH)
      const pairPricePoints = new Map<string, Array<{ b: number; price: number }>>();

      const iface = new ethers.utils.Interface(PAIR_ABI);

      for (let start = fromBlock; start <= head; start += CHUNK) {
        const end = Math.min(head, start + CHUNK - 1);
        let logs: ethers.providers.Log[] = [];
        try {
          // Single chunked getLogs — filter by pair address list when small,
          // otherwise filter by topic only and post-filter in JS.
          logs = await provider.send('eth_getLogs', [{
            fromBlock: ethers.utils.hexValue(start),
            toBlock: ethers.utils.hexValue(end),
            topics: [SWAP_TOPIC],
          }]);
        } catch (e) {
          console.warn('market metrics: getLogs chunk failed', start, end, e);
          continue;
        }

        for (const log of logs) {
          const pair = (log.address || '').toLowerCase();
          const meta = pairMeta.get(pair);
          if (!meta) continue;
          try {
            const parsed = iface.parseLog(log);
            const a0In  = parsed.args.amount0In  as ethers.BigNumber;
            const a1In  = parsed.args.amount1In  as ethers.BigNumber;
            const a0Out = parsed.args.amount0Out as ethers.BigNumber;
            const a1Out = parsed.args.amount1Out as ethers.BigNumber;
            const v0 = parseFloat(ethers.utils.formatEther(a0In.add(a0Out)));
            const v1 = parseFloat(ethers.utils.formatEther(a1In.add(a1Out)));
            if (!isFinite(v0) || !isFinite(v1)) continue;

            const m0 = ensure(meta.t0);
            const m1 = ensure(meta.t1);
            m0.volume24h += v0; m1.volume24h += v1;
            m0.swaps += 1;      m1.swaps += 1;

            // Build price series for the non-WETH side of WETH pairs.
            if (meta.t0 === WETH_LOWER || meta.t1 === WETH_LOWER) {
              const blockNum = typeof log.blockNumber === 'string'
                ? parseInt(log.blockNumber as any, 16) : log.blockNumber as number;
              const t0Net = parseFloat(ethers.utils.formatEther(a0In.sub(a0Out)));
              const t1Net = parseFloat(ethers.utils.formatEther(a1In.sub(a1Out)));
              if (t0Net !== 0 && t1Net !== 0) {
                const priceT0InT1 = Math.abs(t1Net) / Math.abs(t0Net);
                // price of NON-weth in WETH:
                const priceNonInWeth = meta.t0 === WETH_LOWER ? (1 / priceT0InT1) : priceT0InT1;
                if (isFinite(priceNonInWeth) && priceNonInWeth > 0) {
                  const arr = pairPricePoints.get(pair) ?? [];
                  arr.push({ b: blockNum, price: priceNonInWeth });
                  pairPricePoints.set(pair, arr);
                }
              }
            }
          } catch { /* malformed log */ }
        }
      }

      // Fold price points into per-token sparkline (use the WETH pair with
      // the most points for each token).
      const tokenBestPair = new Map<string, string>(); // tokenLower → pairLower
      const tokenBestCount = new Map<string, number>();
      for (const [pair, points] of pairPricePoints) {
        const meta = pairMeta.get(pair)!;
        const other = meta.t0 === WETH_LOWER ? meta.t1 : meta.t0;
        if (!points.length) continue;
        if ((tokenBestCount.get(other) ?? 0) < points.length) {
          tokenBestCount.set(other, points.length);
          tokenBestPair.set(other, pair);
        }
      }
      for (const [tokenLower, pair] of tokenBestPair) {
        const pts = (pairPricePoints.get(pair) ?? [])
          .slice()
          .sort((a, b) => a.b - b.b);
        if (pts.length === 0) continue;
        // Down-sample to max 24 points.
        const MAX_PTS = 24;
        let sampled: number[];
        if (pts.length <= MAX_PTS) {
          sampled = pts.map(p => p.price);
        } else {
          const stride = pts.length / MAX_PTS;
          sampled = Array.from({ length: MAX_PTS }, (_, i) => pts[Math.floor(i * stride)].price);
        }
        const m = ensure(tokenLower);
        m.prices = sampled;
        const first = sampled[0];
        const last = sampled[sampled.length - 1];
        m.change = first > 0 ? ((last - first) / first) * 100 : 0;
      }

      setMetrics(out);
      writeCache({ fetchedAt: Date.now(), pairsHash, metrics: out });
    } catch (e: any) {
      setError(e?.message || 'Failed to load market metrics');
    } finally {
      setLoading(false);
    }
  }, [getCachedPairsWithInfo]);

  useEffect(() => { fetchOnce(false); }, [fetchOnce]);

  return {
    metrics,
    loading,
    error,
    refresh: () => fetchOnce(true),
    /** Helper: best-effort metric for any token address. */
    get: (addr: string): TokenMetric => metrics[addr.toLowerCase()] || emptyMetric(addr),
  };
}
