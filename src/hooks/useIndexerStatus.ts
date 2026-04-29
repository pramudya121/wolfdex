import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '@/config/contracts';

/**
 * useIndexerStatus
 * Lightweight, shared poller that exposes:
 *  - latestBlock: head of the chain (polled every `interval` ms)
 *  - rpcOk: false if last poll failed
 *  - lastUpdated: ms timestamp of last successful poll
 *
 * Used to power the data-freshness badge across analytics surfaces.
 * Single shared interval per page (one hook instance per consumer is fine,
 * RPC calls are tiny eth_blockNumber).
 */
export interface IndexerStatus {
  latestBlock: number;
  rpcOk: boolean;
  lastUpdated: number;
  source: 'rpc-events';
  rpcUrl: string;
}

export function useIndexerStatus(intervalMs = 12_000): IndexerStatus {
  const [state, setState] = useState<IndexerStatus>({
    latestBlock: 0,
    rpcOk: true,
    lastUpdated: 0,
    source: 'rpc-events',
    rpcUrl: CHAIN_CONFIG.rpcUrl,
  });

  useEffect(() => {
    let cancelled = false;
    const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
    const tick = async () => {
      try {
        const head = await provider.getBlockNumber();
        if (cancelled) return;
        setState(s => ({ ...s, latestBlock: head, rpcOk: true, lastUpdated: Date.now() }));
      } catch {
        if (cancelled) return;
        setState(s => ({ ...s, rpcOk: false }));
      }
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [intervalMs]);

  return state;
}
