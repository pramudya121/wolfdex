/**
 * useMarketSocial — local (per-browser) social layer for the Market page:
 * upvotes and watchlist stars. Persisted in localStorage and shared across
 * mounted components through a tiny subscriber list so every card stays in
 * sync instantly.
 */
import { useCallback, useEffect, useState } from 'react';

const VOTES_KEY = 'wolfdex.market.votes.v1';
const WATCH_KEY = 'wolfdex.market.watchlist.v1';

type VoteMap = Record<string, number>;

let subs: Array<() => void> = [];
function notify() { subs.forEach(fn => { try { fn(); } catch { /* noop */ } }); }

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  notify();
}

export function useMarketSocial() {
  const [votes, setVotes] = useState<VoteMap>({});
  const [watchlist, setWatchlist] = useState<string[]>([]);

  const sync = useCallback(() => {
    setVotes(read<VoteMap>(VOTES_KEY, {}));
    setWatchlist(read<string[]>(WATCH_KEY, []));
  }, []);

  // Hydration-safe: only read localStorage after mount.
  useEffect(() => {
    sync();
    subs.push(sync);
    return () => { subs = subs.filter(s => s !== sync); };
  }, [sync]);

  const vote = useCallback((address: string) => {
    const key = address.toLowerCase();
    const current = read<VoteMap>(VOTES_KEY, {});
    if (current[key]) {
      delete current[key];
    } else {
      current[key] = 1;
    }
    write(VOTES_KEY, current);
  }, []);

  const toggleWatch = useCallback((address: string) => {
    const key = address.toLowerCase();
    const current = read<string[]>(WATCH_KEY, []);
    const next = current.includes(key) ? current.filter(a => a !== key) : [...current, key];
    write(WATCH_KEY, next);
  }, []);

  const hasVoted = useCallback((address: string) => !!votes[address.toLowerCase()], [votes]);
  const isWatched = useCallback((address: string) => watchlist.includes(address.toLowerCase()), [watchlist]);

  return { votes, watchlist, vote, toggleWatch, hasVoted, isWatched, voteCount: (a: string) => votes[a.toLowerCase()] ?? 0 };
}
