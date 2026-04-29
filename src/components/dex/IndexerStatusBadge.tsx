import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useIndexerStatus } from '@/hooks/useIndexerStatus';

/**
 * IndexerStatusBadge
 * Compact pill that shows:
 *  - 🟢 LIVE   — RPC poll healthy, data < freshThresholdMs old
 *  - 🟡 SYNCING — last data older than threshold (subgraph slow → RPC catching up)
 *  - 🔴 OFFLINE — RPC poll failing
 * Hover/click reveals: source (RPC events), latest block, age, refresh button.
 */
interface Props {
  /** Last time the consuming hook successfully wrote data (ms). 0 = never. */
  dataFetchedAt?: number;
  /** Block number consumer last indexed up to. */
  dataLatestBlock?: number;
  /** Loading flag from the consumer hook. */
  loading?: boolean;
  /** Optional refresh callback (e.g. force re-index). */
  onRefresh?: () => void;
  /** Threshold (ms) above which we show "SYNCING". Default 90s. */
  freshThresholdMs?: number;
  className?: string;
}

function formatAge(ms: number) {
  if (ms < 1000) return 'just now';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export default function IndexerStatusBadge({
  dataFetchedAt = 0,
  dataLatestBlock = 0,
  loading = false,
  onRefresh,
  freshThresholdMs = 90_000,
  className = '',
}: Props) {
  const status = useIndexerStatus();
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);

  // Re-render every 5s so the "ago" label stays accurate.
  useEffect(() => {
    const id = window.setInterval(() => force(n => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const age = dataFetchedAt > 0 ? Date.now() - dataFetchedAt : Infinity;
  const blockLag = status.latestBlock && dataLatestBlock
    ? Math.max(0, status.latestBlock - dataLatestBlock)
    : 0;

  let level: 'live' | 'syncing' | 'offline' = 'live';
  let dot = 'bg-green-500';
  let ring = 'ring-green-400/40';
  let label = 'LIVE';
  if (!status.rpcOk) {
    level = 'offline'; dot = 'bg-red-500'; ring = 'ring-red-400/40'; label = 'OFFLINE';
  } else if (loading || age > freshThresholdMs || blockLag > 50) {
    level = 'syncing'; dot = 'bg-yellow-400'; ring = 'ring-yellow-400/40'; label = 'SYNCING';
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-wolf-surface/70 border border-wolf-border/40 text-[10px] font-bold uppercase tracking-wider hover:border-wolf-pink/40 transition-colors"
        title="Data source status"
      >
        <span className={`relative inline-flex w-2 h-2 rounded-full ${dot} ring-2 ${ring}`}>
          {level === 'live' && (
            <motion.span
              className={`absolute inset-0 rounded-full ${dot}`}
              animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            />
          )}
        </span>
        <span className={
          level === 'live' ? 'text-green-400' :
          level === 'syncing' ? 'text-yellow-400' : 'text-red-400'
        }>{label}</span>
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute right-0 top-full mt-2 z-50 w-72 wolf-card rounded-xl p-3 text-xs shadow-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-foreground">Data source</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
          <dl className="space-y-1.5 text-muted-foreground">
            <div className="flex justify-between gap-2">
              <dt>Source</dt>
              <dd className="text-foreground font-medium">RPC event indexer</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Status</dt>
              <dd className={
                level === 'live' ? 'text-green-400 font-bold' :
                level === 'syncing' ? 'text-yellow-400 font-bold' : 'text-red-400 font-bold'
              }>{label}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Chain head</dt>
              <dd className="text-foreground font-mono">#{status.latestBlock || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Indexed up to</dt>
              <dd className="text-foreground font-mono">#{dataLatestBlock || '—'}</dd>
            </div>
            {blockLag > 0 && (
              <div className="flex justify-between gap-2">
                <dt>Block lag</dt>
                <dd className={blockLag > 50 ? 'text-yellow-400' : 'text-foreground'}>{blockLag} blocks</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt>Last refresh</dt>
              <dd className="text-foreground">{dataFetchedAt ? formatAge(age) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-3 pt-2 border-t border-wolf-border/30 text-[10px] text-muted-foreground/80 leading-relaxed">
            Charts are built directly from on-chain Swap events via RPC <code className="font-mono">eth_getLogs</code>.
            No third-party subgraph dependency — data stays live even if external indexers go down.
          </p>
          {onRefresh && (
            <button
              onClick={() => { onRefresh(); setOpen(false); }}
              disabled={loading}
              className="mt-3 w-full py-2 rounded-lg wolf-btn-primary text-xs font-semibold disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : '↻ Force refresh'}
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}
