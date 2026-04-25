import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenInfo } from '@/config/contracts';

export type LimitOrderStatus = 'open' | 'filled' | 'cancelled' | 'failed' | 'expired';
export type LimitOrderSide = 'buy' | 'sell'; // sell fromToken at >= targetRate, or buy when rate <= targetRate

export interface LimitOrder {
  id: string;
  account: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  amountIn: string;          // raw decimal string the user wants to spend
  /** Target exchange rate as toToken-per-fromToken (e.g. 1 ETH = 2500 USDC → "2500"). */
  targetRate: string;
  side: LimitOrderSide;
  status: LimitOrderStatus;
  createdAt: number;
  expiresAt: number;         // ms epoch — 0 means never
  /** Tx hash once filled. */
  txHash?: string;
  /** Last quoted output (for live UI). */
  lastQuoteOut?: string;
  /** Last poll timestamp. */
  lastCheckedAt?: number;
  /** Failure reason if status=failed. */
  errorMessage?: string;
}

const KEY = 'wolfdex.limitOrders.v1';
const MAX = 100;
export const POLL_INTERVAL_MS = 15_000;

function load(): LimitOrder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch { return []; }
}
function save(list: LimitOrder[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); }
  catch { /* ignore quota */ }
}

const listeners = new Set<(list: LimitOrder[]) => void>();
let memory: LimitOrder[] | null = null;
function getAll(): LimitOrder[] {
  if (memory == null) memory = load();
  return memory;
}
function setAll(next: LimitOrder[]) {
  memory = next;
  save(next);
  for (const l of listeners) l(next);
}

interface WatcherDeps {
  /** Active wallet address — orders are only watched for this account. */
  account: string | null;
  /** Smart-route quote function — returns best output for amountIn. */
  getQuote: (from: TokenInfo, to: TokenInfo, amountIn: string) => Promise<{ amountOut: string; path: string[] } | null>;
  /** Execute swap with the smart-routed path. */
  swap: (from: TokenInfo, to: TokenInfo, amountIn: string, amountOut: string, slippagePct?: number, deadlineMinutes?: number, routePath?: string[]) => Promise<string>;
  /** Default slippage % (string from txSettings). */
  slippagePct: number;
  /** Default deadline minutes. */
  deadlineMinutes: number;
  /** Optional callback when an order fills (e.g. toast + history). */
  onFilled?: (order: LimitOrder, txHash: string) => void;
  /** Optional callback when a fill attempt fails. */
  onError?: (order: LimitOrder, message: string) => void;
}

/**
 * Decide whether the live quote satisfies the user's target rate.
 *  - sell side: fill when (amountOut / amountIn) >= targetRate
 *  - buy  side: fill when (amountOut / amountIn) >= targetRate as well
 * (Limit orders here are always "I want at least X out per unit in" — the
 * side flag is purely cosmetic for the UI direction.)
 */
function shouldFill(order: LimitOrder, quoteOut: string): boolean {
  const inN = parseFloat(order.amountIn);
  const outN = parseFloat(quoteOut);
  const target = parseFloat(order.targetRate);
  if (!inN || !outN || !target) return false;
  const liveRate = outN / inN;
  return liveRate >= target;
}

export function useLimitOrders(account?: string | null) {
  const [list, setList] = useState<LimitOrder[]>(() => getAll());

  useEffect(() => {
    const onChange = (next: LimitOrder[]) => setList(next);
    listeners.add(onChange);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) { memory = load(); setList(memory); }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const create = useCallback((order: Omit<LimitOrder, 'id' | 'createdAt' | 'status'>) => {
    const id = `lo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const next: LimitOrder = {
      ...order,
      id,
      status: 'open',
      createdAt: Date.now(),
    };
    setAll([next, ...getAll()]);
    return next;
  }, []);

  const update = useCallback((id: string, patch: Partial<LimitOrder>) => {
    setAll(getAll().map(o => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const cancel = useCallback((id: string) => {
    setAll(getAll().map(o => (o.id === id ? { ...o, status: 'cancelled' as LimitOrderStatus } : o)));
  }, []);

  const remove = useCallback((id: string) => {
    setAll(getAll().filter(o => o.id !== id));
  }, []);

  const clear = useCallback(() => setAll([]), []);

  const filtered = account
    ? list.filter(o => o.account.toLowerCase() === account.toLowerCase())
    : list;

  const openCount = filtered.filter(o => o.status === 'open').length;

  return { list: filtered, all: list, create, update, cancel, remove, clear, openCount };
}

/**
 * Background watcher hook — polls every 15s, expires stale orders, and
 * auto-executes any order whose live rate hits the target.
 *
 * Mount this ONCE at the app root (or in the swap page) so the watcher
 * keeps running while the user navigates other pages.
 */
export function useLimitOrderWatcher(deps: WatcherDeps) {
  const { account, getQuote, swap, slippagePct, deadlineMinutes, onFilled, onError } = deps;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Lock to avoid double-firing the same order when polls overlap.
  const inflight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!account) return;

    let cancelled = false;

    const tick = async () => {
      const open = getAll().filter(
        o => o.status === 'open' && o.account.toLowerCase() === account.toLowerCase(),
      );
      if (open.length === 0) return;

      const now = Date.now();
      // 1. expire stale orders
      for (const o of open) {
        if (o.expiresAt && o.expiresAt > 0 && now > o.expiresAt) {
          setAll(getAll().map(x => (x.id === o.id ? { ...x, status: 'expired' as LimitOrderStatus } : x)));
        }
      }

      // 2. quote + maybe fill the rest
      const stillOpen = getAll().filter(
        o => o.status === 'open' && o.account.toLowerCase() === account.toLowerCase(),
      );

      await Promise.all(stillOpen.map(async (order) => {
        if (inflight.current.has(order.id)) return;
        try {
          const quote = await depsRef.current.getQuote(order.fromToken, order.toToken, order.amountIn);
          if (cancelled) return;
          if (!quote) return;

          // persist live quote for UI
          setAll(getAll().map(x => (x.id === order.id
            ? { ...x, lastQuoteOut: quote.amountOut, lastCheckedAt: Date.now() }
            : x)));

          if (!shouldFill(order, quote.amountOut)) return;

          // Try to execute. Lock first to prevent duplicate fills.
          inflight.current.add(order.id);
          try {
            const hash = await depsRef.current.swap(
              order.fromToken,
              order.toToken,
              order.amountIn,
              quote.amountOut,
              depsRef.current.slippagePct,
              depsRef.current.deadlineMinutes,
              quote.path,
            );
            setAll(getAll().map(x => (x.id === order.id
              ? { ...x, status: 'filled' as LimitOrderStatus, txHash: hash }
              : x)));
            depsRef.current.onFilled?.({ ...order, status: 'filled', txHash: hash }, hash);
          } catch (e: any) {
            const msg = e?.reason || e?.message || 'Execution failed';
            setAll(getAll().map(x => (x.id === order.id
              ? { ...x, status: 'failed' as LimitOrderStatus, errorMessage: msg }
              : x)));
            depsRef.current.onError?.(order, msg);
          } finally {
            inflight.current.delete(order.id);
          }
        } catch {
          // swallow per-order quote errors so others keep polling
        }
      }));
    };

    // Initial tick + interval
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
    // We intentionally only depend on `account` — getQuote/swap/etc come via depsRef
    // so identity changes do not restart the polling loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
}
