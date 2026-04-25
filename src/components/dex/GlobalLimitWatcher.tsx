import { toast } from 'sonner';
import { useDexContext, useTxSettings } from '@/context/DexContext';
import { useLimitOrders, useLimitOrderWatcher } from '@/hooks/useLimitOrders';
import { CHAIN_CONFIG } from '@/config/contracts';

/**
 * Global limit-order watcher. Runs at the root so open orders keep polling
 * & auto-executing even when the user is on Pools / Farming / Portfolio.
 * Filled orders are pushed into the global tx history and surface a toast
 * via GlobalTxNotifier (success status with explorer link).
 */
export default function GlobalLimitWatcher() {
  const { wallet, dex, txHistory } = useDexContext();
  const { slippage, deadline } = useTxSettings();
  // Mount the store so listeners stay subscribed; we don't render the list.
  useLimitOrders(wallet.address);

  useLimitOrderWatcher({
    account: wallet.address,
    getQuote: async (from, to, amountIn) => {
      const r = await dex.getBestRoute(from, to, amountIn);
      return r ? { amountOut: r.amountOut, path: r.path } : null;
    },
    swap: async (from, to, amountIn, amountOut, slip, ddl, path) => {
      const hash = await dex.swap(from, to, amountIn, amountOut, slip, ddl, path);
      if (hash && wallet.address) {
        txHistory.add({
          hash,
          kind: 'swap',
          summary: `Limit fill: ${parseFloat(amountIn).toFixed(4)} ${from.symbol} → ${parseFloat(amountOut).toFixed(4)} ${to.symbol}`,
          account: wallet.address,
          status: 'success',
          chainId: wallet.chainId,
        });
      }
      return hash!;
    },
    slippagePct: parseFloat(slippage),
    deadlineMinutes: parseFloat(deadline),
    onFilled: (order, hash) => {
      toast.success('🎯 Limit order filled!', {
        description: `${parseFloat(order.amountIn).toFixed(4)} ${order.fromToken.symbol} → ${order.toToken.symbol}`,
        action: {
          label: 'View TX ↗',
          onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank', 'noopener'),
        },
        duration: 8000,
      });
    },
    onError: (order, msg) => {
      toast.error('Limit order failed', {
        description: `${order.fromToken.symbol} → ${order.toToken.symbol}: ${msg.slice(0, 80)}`,
        duration: 8000,
      });
    },
  });

  return null;
}
