/**
 * Legacy global watcher — now a no-op stub.
 *
 * With the on-chain LimitOrderDEX contract deployed at
 * 0xD20d411eCA0398095277DBA86FB8B2166c2079fF, order matching is performed by
 * any taker calling fillOrder() — there is no client-side keeper anymore.
 *
 * We keep the component mounted in __root.tsx so the import path stays
 * stable; it simply ensures the on-chain index polls in the background by
 * subscribing the global useLimitOrders store.
 */
import { useLimitOrders } from '@/hooks/useLimitOrders';
import { useDexContext } from '@/context/DexContext';

export default function GlobalLimitWatcher() {
  const { wallet } = useDexContext();
  // Subscribe so the on-chain indexer runs even on pages that don't render
  // the orders list. The hook itself polls eth_getLogs every 20s.
  useLimitOrders(wallet.address);
  return null;
}
