/**
 * useAggregatorOwner — reads DexAggregatorRouter.owner() and tells whether the
 * connected wallet is the contract owner. Used to gate the /admin page + nav.
 */
import { useEffect, useState } from 'react';
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
