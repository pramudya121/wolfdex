/**
 * useTokenHolders — estimated holder count for an ERC-20 token.
 *
 * Scans recent `Transfer` events over a bounded block window and counts
 * unique non-zero recipients. This is an estimate (only addresses that
 * received the token inside the window are seen), which is why the UI
 * labels it "est.". Cached in localStorage for 5 minutes.
 */
import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getReadProvider } from '@/lib/rpc';

const TRANSFER_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const LOOKBACK_BLOCKS = 8000;
const CACHE_TTL = 300_000;
const ZERO = '0x0000000000000000000000000000000000000000';

const key = (token: string) => `wolfdex.holders.${token.toLowerCase()}.v1`;

export function useTokenHolders(tokenAddress: string | null) {
  const [holders, setHolders] = useState<number | null>(null);
  const [transfers, setTransfers] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchOnce = useCallback(async (force = false) => {
    if (!tokenAddress) return;
    if (!force && typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(key(tokenAddress));
        if (raw) {
          const c = JSON.parse(raw) as { holders: number; transfers: number; fetchedAt: number };
          if (Date.now() - c.fetchedAt < CACHE_TTL) {
            setHolders(c.holders); setTransfers(c.transfers);
            return;
          }
        }
      } catch { /* ignore */ }
    }
    setLoading(true);
    try {
      const provider = getReadProvider();
      const c = new ethers.Contract(tokenAddress, TRANSFER_ABI, provider);
      const head = await provider.getBlockNumber();
      const logs = await c.queryFilter(c.filters.Transfer(), Math.max(0, head - LOOKBACK_BLOCKS), head);
      const set = new Set<string>();
      for (const log of logs) {
        const to = String(log.args?.to ?? '').toLowerCase();
        if (to && to !== ZERO) set.add(to);
      }
      setHolders(set.size);
      setTransfers(logs.length);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(key(tokenAddress), JSON.stringify({
            holders: set.size, transfers: logs.length, fetchedAt: Date.now(),
          }));
        } catch { /* quota */ }
      }
    } catch {
      setHolders(null); setTransfers(null);
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => { setHolders(null); setTransfers(null); fetchOnce(false); }, [fetchOnce]);

  return { holders, transfers, loading, refresh: () => fetchOnce(true) };
}
