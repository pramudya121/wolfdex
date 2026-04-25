import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDexContext } from '@/context/DexContext';
import { CHAIN_CONFIG } from '@/config/contracts';
import type { TxKind, TxRecord, TxStatus } from '@/hooks/useTxHistory';

const KIND_META: Record<TxKind, { icon: string; label: string }> = {
  'swap':              { icon: '🔁', label: 'Swap' },
  'add-liquidity':     { icon: '➕', label: 'Add LP' },
  'remove-liquidity':  { icon: '➖', label: 'Remove LP' },
  'wrap':              { icon: '📦', label: 'Wrap' },
  'unwrap':            { icon: '📤', label: 'Unwrap' },
  'approve':           { icon: '✅', label: 'Approve' },
  'farm-stake':        { icon: '🌾', label: 'Stake' },
  'farm-unstake':      { icon: '🪺', label: 'Unstake' },
  'farm-harvest':      { icon: '🪙', label: 'Harvest' },
  'farm-emergency':    { icon: '⚠️', label: 'Emergency' },
  'farm-admin':        { icon: '⚙️', label: 'Farm Admin' },
  'send':              { icon: '📤', label: 'Send' },
  'agent':             { icon: '🤖', label: 'AI Agent' },
};

function statusColor(s: TxStatus) {
  if (s === 'success') return 'text-green-500 bg-green-500/10 border-green-500/30';
  if (s === 'failed') return 'text-destructive bg-destructive/10 border-destructive/30';
  return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
}

function statusDot(s: TxStatus) {
  if (s === 'success') return 'bg-green-500';
  if (s === 'failed') return 'bg-destructive';
  return 'bg-yellow-500 animate-pulse';
}

function relTime(ts: number) {
  const d = Date.now() - ts;
  if (d < 60_000) return `${Math.max(1, Math.floor(d / 1000))}s ago`;
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export default function TxHistoryPopover() {
  const { txHistory } = useDexContext();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const recent = txHistory.list.slice(0, 12);
  const pending = txHistory.pendingCount;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Recent transactions"
        className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-wolf-surface border border-wolf-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-wolf-pink/40 transition-all"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="hidden md:inline">History</span>
        {pending > 0 && (
          <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-yellow-500/20 text-yellow-500 text-[10px] font-bold">
            {pending}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[340px] sm:w-[380px] max-h-[70vh] overflow-hidden wolf-card rounded-2xl shadow-2xl z-[80]"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-wolf-border/30">
              <div>
                <h3 className="text-sm font-bold">Recent Transactions</h3>
                <p className="text-[10px] text-muted-foreground">
                  {recent.length === 0 ? 'No activity yet' : `${recent.length} on this device`}
                </p>
              </div>
              {recent.length > 0 && (
                <button
                  onClick={() => txHistory.clear()}
                  className="text-[10px] text-muted-foreground hover:text-destructive transition px-2 py-1 rounded"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="overflow-y-auto max-h-[calc(70vh-60px)]">
              {recent.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="text-4xl mb-2 opacity-40">🐺</div>
                  <p className="text-xs text-muted-foreground">
                    Your swaps and liquidity actions will appear here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-wolf-border/20">
                  {recent.map(tx => <TxRow key={tx.hash} tx={tx} />)}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TxRow({ tx }: { tx: TxRecord }) {
  const meta = KIND_META[tx.kind];
  const explorer = `${CHAIN_CONFIG.blockExplorer}/tx/${tx.hash}`;
  return (
    <li className="px-4 py-3 hover:bg-wolf-surface-hover/40 transition">
      <a href={explorer} target="_blank" rel="noreferrer" className="flex items-start gap-3 group">
        <div className="text-lg leading-none mt-0.5 flex-shrink-0">{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-foreground">{meta.label}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-bold ${statusColor(tx.status)}`}>
              <span className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${statusDot(tx.status)}`} />
              {tx.status}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate group-hover:text-foreground transition">
            {tx.summary}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 mt-1">
            <span>{relTime(tx.timestamp)}</span>
            <span className="opacity-40">·</span>
            <span className="font-mono">{tx.hash.slice(0, 6)}…{tx.hash.slice(-4)}</span>
            <span className="opacity-40">·</span>
            <span className="text-wolf-pink opacity-0 group-hover:opacity-100 transition">View ↗</span>
          </div>
        </div>
      </a>
    </li>
  );
}