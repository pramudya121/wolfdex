/**
 * useMarketSocial — local-only (per-browser) state for the Market page.
 *  - votes:     address(lower) -> count
 *  - voted:     set of addresses the current user has voted for
 *  - watchlist: set of addresses the current user is watching
 *
 * Persisted in localStorage. No backend writes are needed; this powers the
 * "Trending", "Voted" and "Watchlist" filters out of the box.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY_VOTES = 'wolfdex.market.votes.v1';
const KEY_VOTED = 'wolfdex.market.voted.v1';
const KEY_WATCH = 'wolfdex.market.watch.v1';

function readJSON<T>(k: string, fb: T): T {
  if (typeof window === 'undefined') return fb;
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fb; } catch { return fb; }
}
function writeJSON(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

type Subscriber = () => void;
const subs: Subscriber[] = [];
function notify() { subs.forEach(fn => { try { fn(); } catch {} }); }

export function useMarketSocial() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force(n => n + 1);
    subs.push(cb);
    return () => { subs.splice(subs.indexOf(cb), 1); };
  }, []);

  const votes = readJSON<Record<string, number>>(KEY_VOTES, {});
  const voted = new Set(readJSON<string[]>(KEY_VOTED, []));
  const watch = new Set(readJSON<string[]>(KEY_WATCH, []));

  const vote = useCallback((address: string) => {
    const k = address.toLowerCase();
    const v = readJSON<Record<string, number>>(KEY_VOTES, {});
    const w = new Set(readJSON<string[]>(KEY_VOTED, []));
    if (w.has(k)) {
      w.delete(k);
      v[k] = Math.max(0, (v[k] || 1) - 1);
    } else {
      w.add(k);
      v[k] = (v[k] || 0) + 1;
    }
    writeJSON(KEY_VOTES, v);
    writeJSON(KEY_VOTED, [...w]);
    notify();
  }, []);

  const toggleWatch = useCallback((address: string) => {
    const k = address.toLowerCase();
    const w = new Set(readJSON<string[]>(KEY_WATCH, []));
    if (w.has(k)) w.delete(k); else w.add(k);
    writeJSON(KEY_WATCH, [...w]);
    notify();
  }, []);

  return {
    votesOf: (a: string) => votes[a.toLowerCase()] || 0,
    hasVoted: (a: string) => voted.has(a.toLowerCase()),
    isWatched: (a: string) => watch.has(a.toLowerCase()),
    votedCount: voted.size,
    watchCount: watch.size,
    vote,
    toggleWatch,
  };
}
