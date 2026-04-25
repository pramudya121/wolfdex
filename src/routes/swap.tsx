import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import SwapCard from "@/components/dex/SwapCard";
import LimitOrderCard from "@/components/dex/LimitOrderCard";
import OpenOrdersList from "@/components/dex/OpenOrdersList";
import LivePriceTicker from "@/components/dex/LivePriceTicker";
import TextGenerateEffect from "@/components/dex/ui/TextGenerateEffect";
import { useDexContext } from "@/context/DexContext";
import { useLimitOrders } from "@/hooks/useLimitOrders";

export const Route = createFileRoute("/swap")({
  head: () => ({
    meta: [
      { title: "Swap & Limit Orders — WolfDex" },
      { name: "description", content: "Swap tokens instantly or place limit orders that auto-execute when your target price is hit. 0.3% fees on LitVM." },
      { property: "og:title", content: "Swap & Limit Orders — WolfDex" },
      { property: "og:description", content: "Swap instantly or set limit orders that fill themselves when price hits your target." },
    ],
  }),
  component: SwapPage,
});

type Tab = 'swap' | 'limit';

function SwapPage() {
  const { wallet, dex, txHistory } = useDexContext();
  const limitOrders = useLimitOrders(wallet.address, wallet.signer);
  const [tab, setTab] = useState<Tab>('swap');

  // Wrap swap to record into the global TX history.
  const swap: typeof dex.swap = async (from, to, amountIn, amountOut, slippagePct, deadlineMinutes, routePath) => {
    const hash = await dex.swap(from, to, amountIn, amountOut, slippagePct, deadlineMinutes, routePath);
    if (hash && wallet.address) {
      const isWrap = from.symbol === 'ETH' && to.symbol === 'WETH';
      const isUnwrap = from.symbol === 'WETH' && to.symbol === 'ETH';
      const kind = isWrap ? 'wrap' : isUnwrap ? 'unwrap' : 'swap';
      const summary = `${parseFloat(amountIn).toFixed(4)} ${from.symbol} → ${parseFloat(amountOut).toFixed(4)} ${to.symbol}`;
      txHistory.add({ hash, kind, summary, account: wallet.address, status: 'success', chainId: wallet.chainId });
    }
    return hash!;
  };

  // NOTE: limit-order auto-execution watcher is mounted globally in __root.tsx
  // (GlobalLimitWatcher) so orders keep filling on every page, not just /swap.

  return (
    <>
      <LivePriceTicker />
      <div className="flex flex-col items-center min-h-[70vh] pt-8 relative">
        {/* Premium ambient glows — no JS, GPU-only blur */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none -z-10">
          <div className="absolute inset-0 rounded-full bg-wolf-pink/10 blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
          <div className="absolute inset-x-20 top-10 bottom-10 rounded-full bg-wolf-gold/10 blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '2s' }} />
        </div>

        <div className="text-center mb-5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-surface/60 border border-wolf-border/30 backdrop-blur-sm text-[11px] mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" />
            <span className="text-muted-foreground">Smart Routing</span>
            <span className="text-wolf-border">·</span>
            <span className="text-muted-foreground">Limit Orders</span>
            <span className="text-wolf-border">·</span>
            <span className="text-muted-foreground">MEV Protected</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black wolf-gradient-text mb-2 tracking-tight">
            <TextGenerateEffect text="Trade with the Pack" />
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            <TextGenerateEffect text="Instant swaps or set-and-forget limit orders." delay={0.3} />
          </p>
        </div>

        {/* Tabs */}
        <div className="inline-flex p-1 rounded-full bg-wolf-surface/60 border border-wolf-border/30 mb-5 relative z-10">
          {(['swap', 'limit'] as const).map(t => (
            <button key={t}
              onClick={() => setTab(t)}
              className={`relative px-5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                tab === t ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t && (
                <motion.span layoutId="swap-tab-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-wolf-pink to-wolf-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {t === 'swap' ? 'Swap' : 'Limit'}
                {t === 'limit' && limitOrders.openCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                    {limitOrders.openCount}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        <div className="w-full max-w-[420px] relative z-10">
          {tab === 'swap' ? (
            <motion.div key="swap"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            >
              <SwapCard
                  swap={swap}
                  getAmountsOut={dex.getAmountsOut}
                  getBestRoute={dex.getBestRoute}
                  getTokenBalance={dex.getTokenBalance}
                  loading={dex.loading}
                  txHash={dex.txHash}
                  error={dex.error}
                  isConnected={wallet.isConnected}
                  onConnectClick={() => {}}
                />
            </motion.div>
          ) : (
            <motion.div key="limit"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="space-y-5"
            >
                <LimitOrderCard
                  getBestRoute={dex.getBestRoute}
                  getTokenBalance={dex.getTokenBalance}
                  isConnected={wallet.isConnected}
                  account={wallet.address}
                  onConnectClick={() => {}}
                  onCreate={limitOrders.create}
                />

                {/* Open orders panel */}
                <div className="moving-border-wrap w-full mx-auto">
                  <div className="moving-border-inner rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        Your Orders
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wolf-pink/15 text-wolf-pink">
                          {limitOrders.list.length}
                        </span>
                      </h3>
                      {limitOrders.list.length > 0 && (
                        <button onClick={limitOrders.clear}
                          className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                        >Clear all</button>
                      )}
                    </div>
                    <OpenOrdersList orders={limitOrders.list} onCancel={limitOrders.cancel} onRemove={limitOrders.remove} />
                  </div>
                </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
