import { motion, AnimatePresence } from 'framer-motion';
import { CHAIN_CONFIG } from '@/config/contracts';
import type { LimitOrder } from '@/hooks/useLimitOrders';

interface Props {
  orders: LimitOrder[];
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
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

export default function OpenOrdersList({ orders, onCancel, onRemove }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
          className="mx-auto mb-3 opacity-40"
        >
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <p>No limit orders yet.</p>
        <p className="text-xs mt-1 opacity-70">Place an order above — it'll auto-fill when your target hits.</p>
      </div>
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

          return (
            <motion.div key={o.id}
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
              className="rounded-xl bg-wolf-dark/60 border border-wolf-border/20 p-3"
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
                  {o.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>
                  <div className="opacity-70">Target</div>
                  <div className="text-foreground font-medium">{parseFloat(o.targetRate).toFixed(6)} {o.toToken.symbol}</div>
                </div>
                <div>
                  <div className="opacity-70">Live</div>
                  <div className="font-medium">
                    {liveRate > 0 ? `${liveRate.toFixed(6)}` : '—'}
                    {distance != null && (
                      <span className={`ml-1 ${distance >= 0 ? 'text-wolf-green' : 'text-yellow-400'}`}>
                        ({distance >= 0 ? '+' : ''}{distance.toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="opacity-70">Expires</div>
                  <div className="text-foreground font-medium">{timeLeft(o.expiresAt)}</div>
                </div>
                <div>
                  <div className="opacity-70">Created</div>
                  <div className="text-foreground font-medium">{new Date(o.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>

              {o.errorMessage && (
                <div className="mt-2 text-[10px] text-destructive truncate">⚠ {o.errorMessage}</div>
              )}

              <div className="flex items-center justify-end gap-2 mt-2">
                {o.txHash && (
                  <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${o.txHash}`} target="_blank" rel="noreferrer"
                    className="text-[11px] text-wolf-gold hover:underline"
                  >View TX →</a>
                )}
                {o.status === 'open' ? (
                  <button onClick={() => onCancel(o.id)}
                    className="text-[11px] px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all"
                  >Cancel</button>
                ) : (
                  <button onClick={() => onRemove(o.id)}
                    className="text-[11px] px-2 py-1 rounded-md bg-wolf-surface text-muted-foreground hover:bg-wolf-surface-hover transition-all"
                  >Clear</button>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
