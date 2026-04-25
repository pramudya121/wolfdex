/**
 * Global limit-order subscriber + status-change notifier.
 *
 * With the on-chain LimitOrderDEX contract, fills happen when any taker calls
 * fillOrder() — there is no client-side keeper. This component:
 *   1. Mounts the on-chain indexer (poll eth_getLogs every 20s) globally so
 *      orders update on every page, not just /swap.
 *   2. Detects when an order belonging to the connected wallet transitions
 *      from `open` → `filled` / `cancelled` / `expired` and surfaces a toast
 *      so users get notified the moment a maker-side event lands on-chain.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useLimitOrders, type LimitOrder } from '@/hooks/useLimitOrders';
import { useDexContext } from '@/context/DexContext';
import { CHAIN_CONFIG } from '@/config/contracts';

export default function GlobalLimitWatcher() {
  const { wallet, txHistory } = useDexContext();
  const { list } = useLimitOrders(wallet.address, wallet.signer);

  // Snapshot last-seen status per orderHash so we only fire once per change.
  const seenRef = useRef<Map<string, LimitOrder['status']>>(new Map());
  // Skip the very first hydration so we don't re-toast historical fills.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!wallet.address) return;
    const me = wallet.address.toLowerCase();
    const mine = list.filter(o => o.account.toLowerCase() === me);

    if (!hydratedRef.current) {
      mine.forEach(o => seenRef.current.set(o.id, o.status));
      hydratedRef.current = true;
      return;
    }

    for (const o of mine) {
      const prev = seenRef.current.get(o.id);
      seenRef.current.set(o.id, o.status);
      if (prev === o.status) continue;
      if (prev !== 'open') continue; // only notify open → terminal transitions

      const pair = `${o.fromToken.symbol} → ${o.toToken.symbol}`;
      if (o.status === 'filled') {
        toast.success(`Limit order filled: ${pair}`, {
          description: `Got ~${parseFloat(o.filledBuy ?? o.amountOut).toFixed(4)} ${o.toToken.symbol}`,
          action: o.txHash ? {
            label: 'View tx',
            onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${o.txHash}`, '_blank'),
          } : undefined,
        });
        if (o.txHash) {
          txHistory.add({
            hash: o.txHash, kind: 'swap', status: 'success',
            summary: `Limit fill: ${parseFloat(o.amountIn).toFixed(4)} ${o.fromToken.symbol} → ${parseFloat(o.filledBuy ?? o.amountOut).toFixed(4)} ${o.toToken.symbol}`,
            account: wallet.address, chainId: wallet.chainId,
          });
        }
      } else if (o.status === 'cancelled') {
        toast(`Limit order cancelled: ${pair}`, { icon: '🚫' });
      } else if (o.status === 'expired') {
        toast(`Limit order expired: ${pair}`, { icon: '⌛' });
      }
    }
  }, [list, wallet.address, wallet.chainId, txHistory]);

  return null;
}
