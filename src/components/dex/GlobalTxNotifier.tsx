import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useDexContext } from '@/context/DexContext';
import { CHAIN_CONFIG } from '@/config/contracts';

const ICON: Record<string, string> = {
  swap: '🔄',
  'add-liquidity': '➕',
  'remove-liquidity': '➖',
  wrap: '📦',
  unwrap: '📤',
  approve: '🔐',
  'farm-stake': '🌱',
  'farm-unstake': '🪺',
  'farm-harvest': '🪙',
  'farm-emergency': '🚨',
  'farm-admin': '⚙️',
  send: '📨',
  agent: '🤖',
};

function shortHash(h: string) {
  if (!h || h.startsWith('pending-')) return '';
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/**
 * Global TX notifier. Watches the persisted txHistory store and surfaces a
 * sonner toast whenever a record transitions pending → success/failed.
 * Mounted once at the root so notifications work no matter which page the
 * user is currently on (including limit-order auto-fills).
 */
export default function GlobalTxNotifier() {
  const { txHistory } = useDexContext();
  // Track previous status per tx hash so we only toast on transitions.
  const seen = useRef<Map<string, string>>(new Map());
  // Track pending placeholder toast ids by summary so we can dismiss them
  // when the real hash arrives (some flows replace `pending-xxx` with a real
  // hash, leaving the old loading toast hanging forever otherwise).
  const pendingBySummary = useRef<Map<string, string>>(new Map());
  const initialized = useRef(false);

  useEffect(() => {
    // First pass: seed map without spamming toasts for old records.
    if (!initialized.current) {
      for (const t of txHistory.all) seen.current.set(t.hash, t.status);
      initialized.current = true;
      return;
    }

    // Detect hashes that disappeared from the list (e.g. a `pending-xxx`
    // placeholder was replaced by a real hash) and dismiss their toasts.
    const currentHashes = new Set(txHistory.all.map(t => t.hash));
    for (const [hash, status] of Array.from(seen.current.entries())) {
      if (!currentHashes.has(hash) && status === 'pending') {
        toast.dismiss(`tx-${hash}`);
        seen.current.delete(hash);
      }
    }

    for (const t of txHistory.all) {
      const prev = seen.current.get(t.hash);
      if (prev === t.status) continue;
      seen.current.set(t.hash, t.status);

      // If a pending placeholder existed with the same summary, dismiss it
      // so the new success/failed toast replaces it cleanly.
      if (t.status !== 'pending') {
        const staleId = pendingBySummary.current.get(t.summary);
        if (staleId && staleId !== `tx-${t.hash}`) {
          toast.dismiss(staleId);
          pendingBySummary.current.delete(t.summary);
        }
      }
      const icon = ICON[t.kind] ?? '📡';
      const explorerUrl = t.hash && !t.hash.startsWith('pending-')
        ? `${CHAIN_CONFIG.blockExplorer}/tx/${t.hash}`
        : null;
      const action = explorerUrl
        ? { label: 'Explorer ↗', onClick: () => window.open(explorerUrl, '_blank', 'noopener') }
        : undefined;

      if (t.status === 'pending') {
        toast.loading(`${icon} ${t.summary}`, {
          id: `tx-${t.hash}`,
          description: explorerUrl
            ? `Submitted • ${shortHash(t.hash)}`
            : 'Waiting for wallet confirmation…',
          action,
        });
      } else if (t.status === 'success') {
        toast.success(`${icon} ${t.summary}`, {
          id: `tx-${t.hash}`,
          description: explorerUrl ? `Confirmed • ${shortHash(t.hash)}` : 'Confirmed',
          action,
          duration: 6000,
        });
      } else if (t.status === 'failed') {
        toast.error(`${icon} ${t.summary}`, {
          id: `tx-${t.hash}`,
          description: explorerUrl ? `Reverted • ${shortHash(t.hash)}` : 'Failed',
          action,
          duration: 8000,
        });
      }
    }
  }, [txHistory.all]);

  return null;
}
