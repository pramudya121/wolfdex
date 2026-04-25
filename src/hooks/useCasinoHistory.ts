import { useCallback, useEffect, useState } from 'react';

/**
 * Persistent local play history for the casino.
 * Stored in localStorage so a refresh keeps the session leaderboard alive.
 * Each entry is one settled play (win OR loss). Capped at 50 newest items.
 */
export interface PlayEntry {
  id: string;
  game: string;
  bet: string;        // zkLTC, formatted
  payout: string;     // zkLTC, formatted
  win: boolean;
  txHash: string;
  ts: number;
}

const KEY = 'wolfdex.casino.history.v1';
const MAX = 50;

function read(): PlayEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(entries: PlayEntry[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX))); } catch { /* quota exceeded etc */ }
}

export function useCasinoHistory() {
  const [entries, setEntries] = useState<PlayEntry[]>([]);

  useEffect(() => {
    setEntries(read());
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) setEntries(read()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const add = useCallback((entry: Omit<PlayEntry, 'id' | 'ts'>) => {
    setEntries(prev => {
      const next = [{ ...entry, id: crypto.randomUUID(), ts: Date.now() }, ...prev].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
    write([]);
  }, []);

  // Session aggregates (recomputed cheaply per render)
  const stats = (() => {
    let plays = 0, wins = 0, wagered = 0, won = 0;
    for (const e of entries) {
      plays++;
      const b = parseFloat(e.bet) || 0;
      const p = parseFloat(e.payout) || 0;
      wagered += b;
      won += p;
      if (e.win) wins++;
    }
    return {
      plays,
      wins,
      losses: plays - wins,
      winRate: plays > 0 ? (wins / plays) * 100 : 0,
      wagered,
      won,
      pnl: won - wagered,
    };
  })();

  return { entries, add, clear, stats };
}
