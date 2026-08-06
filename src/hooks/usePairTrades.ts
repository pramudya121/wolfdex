/**
 * usePairTrades — recent on-chain trades for a single AMM pair.
 *
 * Reads the pair's `Swap` events over a bounded block window, resolves
 * block timestamps in small batches, and classifies every swap as a
 * BUY or SELL of the tracked token (native side = quote).
 * Results are cached in localStorage for 60s so page revisits are instant.
 */
import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '@/lib/rpc';
import { PAIR_ABI } from '@/config/abis';

export interface Trade {
  hash: string;
  block: number;
  ts: number;                 // unix seconds (0 when unknown)
  side: 'buy' | 'sell';
  tokenAmount: number;
  nativeAmount: number;
  price: number;              // native per token
  account: string;
}

const LOOKBACK_BLOCKS = 8000;
const CACHE_TTL = 60_000;

interface CacheEntry { trades: Trade[]; fetchedAt: number }

const key = (pair: string, token: string) =>
  `wolfdex.trades.${pair.toLowerCase()}.${token.toLowerCase()}.v1`;

function readCache(pair: string, token: string): Trade[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(pair, token));
    if (!raw) return null;
    const c = JSON.parse(raw) as CacheEntry;
    if (Date.now() - c.fetchedAt > CACHE_TTL) return null;
    return c.trades;
  } catch { return null; }
}
function writeCache(pair: string, token: string, trades: Trade[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key(pair, token), JSON.stringify({ trades, fetchedAt: Date.now() } satisfies CacheEntry));
  } catch { /* quota */ }
}

export function usePairTrades(
  pairAddress: string | null,
  tokenAddress: string,
  tokenDecimals = 18,
  limit = 25,
) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async (force = false) => {
    if (!pairAddress) { setTrades([]); return; }
    if (!force) {
      const cached = readCache(pairAddress, tokenAddress);
      if (cached) { setTrades(cached.slice(0, limit)); return; }
    }
    setLoading(true); setError(null);
    try {
      const provider = getReadProvider();
      const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
      const head = await provider.getBlockNumber();
      const from = Math.max(0, head - LOOKBACK_BLOCKS);
      const [logs, token0] = await Promise.all([
        pair.queryFilter(pair.filters.Swap(), from, head),
        pair.token0() as Promise<string>,
      ]);
      const tokenIsToken0 = String(token0).toLowerCase() === tokenAddress.toLowerCase();

      const recent = logs.slice(-limit).reverse();
      const blockNums = Array.from(new Set(recent.map(l => l.blockNumber)));
      const tsMap = new Map<number, number>();
      const CHUNK = 8;
      for (let i = 0; i < blockNums.length; i += CHUNK) {
        const slice = blockNums.slice(i, i + CHUNK);
        const blocks = await Promise.all(slice.map(b => provider.getBlock(b).catch(() => null)));
        slice.forEach((b, idx) => { if (blocks[idx]) tsMap.set(b, blocks[idx]!.timestamp); });
      }

      const out: Trade[] = [];
      for (const log of recent) {
        const a = log.args;
        if (!a) continue;
        const a0In = a.amount0In as ethers.BigNumber;
        const a1In = a.amount1In as ethers.BigNumber;
        const a0Out = a.amount0Out as ethers.BigNumber;
        const a1Out = a.amount1Out as ethers.BigNumber;

        const tokenIn = tokenIsToken0 ? a0In : a1In;
        const tokenOut = tokenIsToken0 ? a0Out : a1Out;
        const nativeIn = tokenIsToken0 ? a1In : a0In;
        const nativeOut = tokenIsToken0 ? a1Out : a0Out;

        const tokenAmount = parseFloat(
          ethers.utils.formatUnits(tokenOut.gt(tokenIn) ? tokenOut : tokenIn, tokenDecimals),
        );
        const nativeAmount = parseFloat(
          ethers.utils.formatUnits(nativeOut.gt(nativeIn) ? nativeOut : nativeIn, 18),
        );
        if (!isFinite(tokenAmount) || tokenAmount <= 0) continue;

        out.push({
          hash: log.transactionHash,
          block: log.blockNumber,
          ts: tsMap.get(log.blockNumber) ?? 0,
          // token leaving the pool = user bought the token
          side: tokenOut.gt(tokenIn) ? 'buy' : 'sell',
          tokenAmount,
          nativeAmount,
          price: nativeAmount > 0 ? nativeAmount / tokenAmount : 0,
          account: String(a.to ?? ''),
        });
      }
      setTrades(out);
      writeCache(pairAddress, tokenAddress, out);
    } catch (e: any) {
      setError(e?.message || 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, [pairAddress, tokenAddress, tokenDecimals, limit]);

  useEffect(() => { setTrades([]); fetchOnce(false); }, [fetchOnce]);

  return { trades, loading, error, refresh: () => fetchOnce(true) };
}
