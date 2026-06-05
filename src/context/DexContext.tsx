import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useDex } from '@/hooks/useDex';
import { useTxHistory } from '@/hooks/useTxHistory';
import { useFarming } from '@/hooks/useFarming';

interface PairInfo {
  reserve0: string;
  reserve1: string;
  token0: string;
  token1: string;
  totalSupply: string;
}

interface PairsCache {
  pairs: string[];
  infos: Record<string, PairInfo | null>;
  fetchedAt: number;
}

const CACHE_TTL = 60_000; // 1 minute
const PAIRS_CACHE_STORAGE_KEY = 'wolfdex.pairsCache.v1';
const PAIRS_CACHE_PERSIST_TTL = 5 * 60_000; // 5 minutes — used for instant first paint
const TX_SETTINGS_STORAGE_KEY = 'wolfdex.txSettings.v1';

interface TxSettings {
  slippage: string;       // percent string e.g. "0.5"
  deadline: string;       // minutes string e.g. "20"
  expertMode: boolean;    // unlocks slippage > 50%, hides price-impact warnings
  setSlippage: (v: string) => void;
  setDeadline: (v: string) => void;
  setExpertMode: (v: boolean) => void;
}

interface DexContextType {
  wallet: ReturnType<typeof useWallet>;
  dex: ReturnType<typeof useDex>;
  showWalletModal: boolean;
  setShowWalletModal: (v: boolean) => void;
  /** Cached aggregator: returns all pair addresses + their info, refetches only if stale. */
  getCachedPairsWithInfo: (force?: boolean) => Promise<PairsCache>;
  /** Invalidate the cache (call after addLiquidity/removeLiquidity). */
  invalidatePairsCache: () => void;
  /** Global tx settings (slippage + deadline + expert mode) — shared everywhere. */
  txSettings: TxSettings;
  /** Cross-page recent transactions (localStorage-persisted, scoped to current account). */
  txHistory: ReturnType<typeof useTxHistory>;
  /** Shared farming state (single source of truth across Farms + Portfolio + AI agent). */
  farming: ReturnType<typeof useFarming>;
  /** Toggle the global AI trading agent panel. */
  showAgent: boolean;
  setShowAgent: (v: boolean) => void;
}

const DexContext = createContext<DexContextType | null>(null);

export function DexProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const dex = useDex(wallet.signer, wallet.address);
  const txHistory = useTxHistory(wallet.address);
  const farming = useFarming(wallet.signer, wallet.address);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showAgent, setShowAgent] = useState(false);

  // Global tx settings — single source of truth (lazy-init from localStorage)
  const [slippage, setSlippageState] = useState('0.5');
  const [deadline, setDeadlineState] = useState('20');
  const [expertMode, setExpertModeState] = useState(false);

  // Hydrate from localStorage on mount (client-only to avoid SSR mismatch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(TX_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.slippage === 'string') setSlippageState(parsed.slippage);
      if (typeof parsed.deadline === 'string') setDeadlineState(parsed.deadline);
      if (typeof parsed.expertMode === 'boolean') setExpertModeState(parsed.expertMode);
    } catch { /* ignore corrupt cache */ }
  }, []);

  // Persist on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        TX_SETTINGS_STORAGE_KEY,
        JSON.stringify({ slippage, deadline, expertMode }),
      );
    } catch { /* ignore quota errors */ }
  }, [slippage, deadline, expertMode]);

  const setSlippage = useCallback((v: string) => {
    // Cap at 50% unless expert mode is on
    const num = parseFloat(v);
    if (!expertMode && !isNaN(num) && num > 50) {
      setSlippageState('50');
      return;
    }
    setSlippageState(v);
  }, [expertMode]);
  const setDeadline = useCallback((v: string) => setDeadlineState(v), []);
  const setExpertMode = useCallback((v: boolean) => {
    setExpertModeState(v);
    // Turning expert mode OFF should clamp slippage back to safe range
    if (!v) {
      setSlippageState(prev => {
        const num = parseFloat(prev);
        return !isNaN(num) && num > 50 ? '50' : prev;
      });
    }
  }, []);

  const cacheRef = useRef<PairsCache | null>(null);
  const inflightRef = useRef<Promise<PairsCache> | null>(null);

  // Hydrate pairs cache from localStorage on mount → instant first paint on Pools/Analytics
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(PAIRS_CACHE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PairsCache;
      if (parsed && Array.isArray(parsed.pairs) && parsed.infos &&
          Date.now() - parsed.fetchedAt < PAIRS_CACHE_PERSIST_TTL) {
        cacheRef.current = parsed;
      }
    } catch { /* ignore */ }
  }, []);

  const getCachedPairsWithInfo = useCallback(async (force = false): Promise<PairsCache> => {
    const now = Date.now();
    if (!force && cacheRef.current && now - cacheRef.current.fetchedAt < CACHE_TTL) {
      return cacheRef.current;
    }
    if (inflightRef.current) return inflightRef.current;

    inflightRef.current = (async () => {
      const pairs = await dex.getAllPairs();
      // Single multicall RPC for all pairs (was N*4 sequential calls)
      const infos = pairs.length > 0 ? await dex.getPairInfosBatch(pairs) : {};
      const next: PairsCache = { pairs, infos, fetchedAt: Date.now() };
      cacheRef.current = next;
      // Persist for next page load / next session
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PAIRS_CACHE_STORAGE_KEY, JSON.stringify(next));
        }
      } catch { /* quota */ }
      return next;
    })();

    try {
      return await inflightRef.current;
    } finally {
      inflightRef.current = null;
    }
  }, [dex]);

  const invalidatePairsCache = useCallback(() => {
    cacheRef.current = null;
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(PAIRS_CACHE_STORAGE_KEY);
    } catch { /* ignore */ }
  }, []);

  // Prefetch pairs once at app startup so navigating to Pools / Analytics is instant
  useEffect(() => {
    const t = setTimeout(() => { getCachedPairsWithInfo().catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [getCachedPairsWithInfo]);

  return (
    <DexContext.Provider value={{
      wallet, dex, showWalletModal, setShowWalletModal,
      getCachedPairsWithInfo, invalidatePairsCache,
      txSettings: { slippage, deadline, expertMode, setSlippage, setDeadline, setExpertMode },
      txHistory,
      farming,
      showAgent, setShowAgent,
    }}>
      {children}
    </DexContext.Provider>
  );
}

export function useDexContext() {
  const ctx = useContext(DexContext);
  if (!ctx) throw new Error('useDexContext must be used within DexProvider');
  return ctx;
}

/** Convenience hook for components that only care about tx settings. */
export function useTxSettings() {
  return useDexContext().txSettings;
}
