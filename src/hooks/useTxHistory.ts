import { useCallback, useEffect, useState } from 'react';

export type TxKind = 'swap' | 'add-liquidity' | 'remove-liquidity' | 'wrap' | 'unwrap' | 'approve' | 'farm-stake' | 'farm-unstake' | 'farm-harvest' | 'farm-emergency' | 'farm-admin' | 'send' | 'agent';
export type TxStatus = 'pending' | 'success' | 'failed';

export interface TxRecord {
  hash: string;
  kind: TxKind;
  status: TxStatus;
  /** Human-readable summary, e.g. "Swap 1.5 ETH → 4,200 USDC" */
  summary: string;
  /** Wallet that submitted the tx (used to scope history per-address). */
  account: string;
  /** ms epoch */
  timestamp: number;
  /** Chain id at submit time, optional. */
  chainId?: number | null;
}

const KEY = 'wolfdex.txHistory.v1';
const MAX = 50;

function load(): TxRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch { return []; }
}

function save(list: TxRecord[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); }
  catch { /* ignore quota */ }
}

/**
 * Cross-tab + cross-component reactive store for tx history.
 * Persists to localStorage and broadcasts via storage events.
 */
const listeners = new Set<(list: TxRecord[]) => void>();
let memory: TxRecord[] | null = null;

function getAll(): TxRecord[] {
  if (memory == null) memory = load();
  return memory;
}
function setAll(next: TxRecord[]) {
  memory = next;
  save(next);
  for (const l of listeners) l(next);
}

export function useTxHistory(account?: string | null) {
  const [list, setList] = useState<TxRecord[]>(() => getAll());

  useEffect(() => {
    const onChange = (next: TxRecord[]) => setList(next);
    listeners.add(onChange);
    // cross-tab sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        memory = load();
        setList(memory);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const add = useCallback((rec: Omit<TxRecord, 'timestamp' | 'status'> & { status?: TxStatus }) => {
    const next: TxRecord = {
      ...rec,
      status: rec.status ?? 'pending',
      timestamp: Date.now(),
    };
    setAll([next, ...getAll().filter(t => t.hash !== next.hash)]);
    return next;
  }, []);

  const update = useCallback((hash: string, patch: Partial<TxRecord>) => {
    setAll(getAll().map(t => (t.hash === hash ? { ...t, ...patch } : t)));
  }, []);

  const clear = useCallback(() => setAll([]), []);

  const filtered = account
    ? list.filter(t => t.account.toLowerCase() === account.toLowerCase())
    : list;

  const pendingCount = filtered.filter(t => t.status === 'pending').length;

  return { list: filtered, all: list, add, update, clear, pendingCount };
}