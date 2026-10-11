import { useEffect, useState } from 'react';
import { getReadProvider } from '@/lib/rpc';

/**
 * Shared chain heartbeat. One poller for the whole app: every subscriber
 * (market list, charts, trades) is notified when a new block lands, so
 * N widgets cost one eth_blockNumber call instead of N polls.
 */
type Listener = (block: number) => void;

const BASE_INTERVAL = 5_000;
const MAX_INTERVAL = 30_000;

let listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let current = 0;
let lastSeenAt = 0;
let interval = BASE_INTERVAL;

async function tick() {
  timer = null;
  if (listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) {
    timer = setTimeout(tick, BASE_INTERVAL);
    return;
  }
  try {
    const b = await getReadProvider().getBlockNumber();
    interval = BASE_INTERVAL;
    lastSeenAt = Date.now();
    if (b > current) {
      current = b;
      listeners.forEach(l => { try { l(b); } catch { /* listener bug must not stop others */ } });
    }
  } catch {
    interval = Math.min(MAX_INTERVAL, interval * 2); // back off when the RPC struggles
  }
  if (listeners.size > 0) timer = setTimeout(tick, interval);
}

export function subscribeBlocks(l: Listener): () => void {
  listeners.add(l);
  if (current > 0) l(current);
  if (!timer) timer = setTimeout(tick, 0);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0 && timer) { clearTimeout(timer); timer = null; }
  };
}

export function getLastBlockSeenAt() { return lastSeenAt; }

/** React view of the heartbeat: block number, last update time, stale flag. */
export function useLiveBlock() {
  const [block, setBlock] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribeBlocks(setBlock), []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const seenAt = lastSeenAt;
  const stale = seenAt > 0 && now - seenAt > 60_000;
  return { block, seenAt, stale };
}
