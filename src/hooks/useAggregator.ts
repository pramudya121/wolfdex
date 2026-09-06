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

export interface AggRouterOption {
  address: string;
  label: string;
  whitelisted: boolean;
}

/**
 * Every DEX router usable by the aggregator: the built-in WolfDex router plus
 * every router the owner tracked in the admin console (shared database), each
 * checked against `isWhitelistedRouter` on-chain so the swap page only ever
 * offers routes that can actually execute.
 */
export function useAggregatorRouters() {
  const [routers, setRouters] = useState<AggRouterOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { listAggregatorRouters } = await import('@/lib/adminRouters.functions');
      const remote = await listAggregatorRouters().catch(() => [] as { address: string; label: string }[]);
      const seen = new Set<string>();
      const base = [{ address: CONTRACTS.ROUTER, label: 'WolfDex Router' }];
      for (const r of remote) {
        if (r.address.toLowerCase() === CONTRACTS.ROUTER.toLowerCase()) continue;
        if (seen.has(r.address.toLowerCase())) continue;
        seen.add(r.address.toLowerCase());
        base.push({ address: ethers.utils.getAddress(r.address), label: r.label });
      }
      const c = new ethers.Contract(CONTRACTS.AGGREGATOR, AGGREGATOR_ABI, getReadProvider());
      const checked = await Promise.all(base.map(async r => {
        try {
          const ok: boolean = await c.isWhitelistedRouter(r.address);
          return { ...r, whitelisted: !!ok };
        } catch {
          return { ...r, whitelisted: false };
        }
      }));
      setRouters(checked);
    } catch {
      setRouters([{ address: CONTRACTS.ROUTER, label: 'WolfDex Router', whitelisted: false }]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { routers, loading, refresh: load };
}

