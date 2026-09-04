/**
 * Hooks around DexAggregatorRouter.
 *
 * - useAggregatorOwner: reads owner() and tells whether the wallet is the owner
 *   (gates the /admin page + nav).
 * - useAggregatorConfig: reads feeBps(), feeRecipient() and
 *   isWhitelistedRouter(ROUTER) so the swap UI can show the real protocol fee
 *   and decide whether the aggregator route is usable at all.
 */
import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/config/contracts';
import { AGGREGATOR_ABI } from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';

export function useAggregatorOwner(address: string | null | undefined) {
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = new ethers.Contract(CONTRACTS.AGGREGATOR, AGGREGATOR_ABI, getReadProvider());
        const o: string = await c.owner();
        if (!cancelled) setOwner(o.toLowerCase());
      } catch {
        if (!cancelled) setOwner(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isOwner = !!owner && !!address && owner === address.toLowerCase();
  return { owner, isOwner, loading };
}

export interface AggregatorLiveConfig {
  feeBps: number;
  feeRecipient: string | null;
  routerWhitelisted: boolean;
  loading: boolean;
}

export function useAggregatorConfig() {
  const [cfg, setCfg] = useState<AggregatorLiveConfig>({
    feeBps: 0, feeRecipient: null, routerWhitelisted: false, loading: true,
  });

  const load = useCallback(async () => {
    try {
      const c = new ethers.Contract(CONTRACTS.AGGREGATOR, AGGREGATOR_ABI, getReadProvider());
      const [bps, recipient, wl] = await Promise.all([
        c.feeBps(),
        c.feeRecipient(),
        c.isWhitelistedRouter(CONTRACTS.ROUTER),
      ]);
      setCfg({
        feeBps: Number(bps.toString()),
        feeRecipient: recipient as string,
        routerWhitelisted: !!wl,
        loading: false,
      });
    } catch {
      setCfg({ feeBps: 0, feeRecipient: null, routerWhitelisted: false, loading: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...cfg, refresh: load };
}
