import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { CHAIN_CONFIG } from '@/config/contracts';
import type { LimitOrder } from '@/hooks/useLimitOrders';

interface Props {
  orders: LimitOrder[];
  /** On-chain cancelOrder — returns the cancel tx hash. */
  onCancel: (id: string) => Promise<string>;
  /** Optional taker fill — present in advanced UIs. */
  onFill?: (id: string) => Promise<string>;
  /** Local hide (no-op for on-chain rows). */
  onRemove?: (id: string) => void;
  /** Connected wallet — used to decide if "Fill" is shown for foreign orders. */
  account?: string | null;
}

function timeLeft(expiresAt: number): string {
  if (!expiresAt) return 'Never';
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'Expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const STATUS_STYLES: Record<LimitOrder['status'], string> = {
  open:      'bg-wolf-pink/15 text-wolf-pink',
  filled:    'bg-wolf-green/15 text-wolf-green',
  cancelled: 'bg-muted text-muted-foreground',
  failed:    'bg-destructive/15 text-destructive',
  expired:   'bg-yellow-500/15 text-yellow-500',
};

export default function OpenOrdersList({ orders, onCancel, onFill, account }: Props) {
  const [pending, setPending] = useState<Record<string, 'cancel' | 'fill' | undefined>>({});

  const handleCancel = async (id: string) => {
    setPending(p => ({ ...p, [id]: 'cancel' }));
    const t = toast.loading('Cancelling on-chain…');
    try {
      const hash = await onCancel(id);
      toast.success('Order cancelled', { id: t, description: `TX: ${hash.slice(0, 12)}…` });
    } catch (e: any) {
      toast.error('Cancel failed', { id: t, description: (e?.reason || e?.message || '').slice(0, 120) });
    } finally {
      setPending(p => ({ ...p, [id]: undefined }));
    }
  };

  const handleFill = async (id: string) => {
    if (!onFill) return;
    setPending(p => ({ ...p, [id]: 'fill' }));
    const t = toast.loading('Filling order on-chain…');
    try {
      const hash = await onFill(id);
      toast.success('Order filled', { id: t, description: `TX: ${hash.slice(0, 12)}…` });
    } catch (e: any) {
      toast.error('Fill failed', { id: t, description: (e?.reason || e?.message || '').slice(0, 120) });
    } finally {
      setPending(p => ({ ...p, [id]: undefined }));
    }
  };

  if (orders.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="wolf-glass rounded-2xl text-center py-10 px-6 relative overflow-hidden"
      >
        <div className="pointer-events-none absolute inset-x-0 -top-16 h-44 bg-[radial-gradient(closest-side,oklch(0.65_0.25_330/20%),transparent)]" />
        <div className="relative inline-flex items-center justify-center mb-3">
          <div className="wolf-empty-orb" />
          <div className="wolf-paw-orbit" />
          <div className="wolf-empty-mascot text-3xl">⏳</div>
        </div>
        <p className="font-bold text-base wolf-gradient-text-animated relative">No on-chain limit orders yet</p>
        <p className="text-xs mt-1 text-muted-foreground max-w-sm mx-auto relative">
          Place an order — it'll be escrowed by LimitOrderDEX and visible across all devices in real time.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {orders.map(o => {
          const liveOut = parseFloat(o.lastQuoteOut || '0');
          const amt = parseFloat(o.amountIn);
          const liveRate = amt > 0 && liveOut > 0 ? liveOut / amt : 0;
          const target = parseFloat(o.targetRate);
          const distance = target > 0 && liveRate > 0 ? ((liveRate / target - 1) * 100) : null;
          const isMine = account && o.account.toLowerCase() === account.toLowerCase();
          const busy = pending[o.id];

          return (
            <motion.div key={o.id}
              initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="wolf-glass wolf-shimmer-hover rounded-xl p-3 hover:border-wolf-pink/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex -space-x-1.5 shrink-0">
                    <img src={o.fromToken.logo} className="w-6 h-6 rounded-full border-2 border-wolf-dark" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <img src={o.toToken.logo} className="w-6 h-6 rounded-full border-2 border-wolf-dark" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div className="text-sm font-semibold truncate">
                    {parseFloat(o.amountIn).toFixed(4)} {o.fromToken.symbol} → {o.toToken.symbol}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${STATUS_STYLES[o.status]}`}>
                  ⛓ {o.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>
                  <div className="opacity-70">Target</div>
                  <div className="text-foreground font-medium">{parseFloat(o.targetRate).toFixed(6)} {o.toToken.symbol}</div>
                </div>
                <div>
                  <div className="opacity-70">Receive</div>
                  <div className="text-foreground font-medium">{parseFloat(o.amountOut).toFixed(6)} {o.toToken.symbol}</div>
                </div>
                <div>
                  <div className="opacity-70">Expires</div>
                  <div className="text-foreground font-medium">{timeLeft(o.expiresAt)}</div>
                </div>
                <div>
                  <div className="opacity-70">Created</div>
                  <div className="text-foreground font-medium">{new Date(o.createdAt).toLocaleString()}</div>
                </div>
                {distance != null && (
                  <div className="col-span-2">
                    <div className="opacity-70">Live market vs target</div>
                    <div className={`font-medium ${distance >= 0 ? 'text-wolf-green' : 'text-yellow-400'}`}>
                      {distance >= 0 ? '+' : ''}{distance.toFixed(2)}% (≈ {liveRate.toFixed(6)})
                    </div>
                  </div>
                )}
              </div>

              {o.errorMessage && (
                <div className="mt-2 text-[10px] text-destructive truncate">⚠ {o.errorMessage}</div>
              )}

              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="text-[10px] font-mono text-muted-foreground/70 truncate">
                  {o.id.slice(0, 12)}…{o.id.slice(-8)}
                </div>
                <div className="flex items-center gap-2">
                  {o.placeTxHash && (
                    <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${o.placeTxHash}`} target="_blank" rel="noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-wolf-gold hover:underline"
                    >Place TX ↗</a>
                  )}
                  {o.txHash && (
                    <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${o.txHash}`} target="_blank" rel="noreferrer"
                      className="text-[11px] text-wolf-gold hover:underline"
                    >Fill TX ↗</a>
                  )}
                  {o.status === 'open' && isMine && (
                    <button onClick={() => handleCancel(o.id)} disabled={!!busy}
                      className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all disabled:opacity-50"
                    >{busy === 'cancel' ? 'Cancelling…' : 'Cancel'}</button>
                  )}
                  {o.status === 'open' && !isMine && onFill && (
                    <button onClick={() => handleFill(o.id)} disabled={!!busy}
                      className="text-[11px] px-2 py-1 rounded-md bg-wolf-green/10 text-wolf-green hover:bg-wolf-green/20 transition-all disabled:opacity-50"
                    >{busy === 'fill' ? 'Filling…' : 'Fill'}</button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
