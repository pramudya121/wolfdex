/**
 * useMarketData — the data engine behind the Market page.
 *
 * Sources:
 *  - Supabase launchpad registry (identity: name/symbol/decimals/logo/verified/created_at)
 *  - Curated TOKENS list (official WolfDex assets)
 *  - On-chain factory/pair reads, batched through Multicall (price + liquidity + supply)
 *
 * Every read for N tokens costs ~2 RPC round-trips regardless of N.
 * A rolling price history is kept in localStorage to power the sparklines.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { multicall } from '@/lib/multicall';
import { FACTORY_ABI, PAIR_ABI, ERC20_ABI } from '@/config/abis';
import { CONTRACTS, TOKENS, isBlockedToken, getTokenBySymbol } from '@/config/contracts';
import { useLaunchpadRegistry } from '@/hooks/useLaunchpadRegistry';

export interface MarketToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  verified: boolean;
  curated: boolean;
  creator: string | null;
  createdAt: number | null;   // unix ms
  /** Price in zkLTC (native) from the token/WzkLTC pool. */
  price: number;
  /** Price in USD, derived from the WzkLTC/USDC pool. 0 when unknown. */
  priceUsd: number;
  /** Liquidity in zkLTC (2 × native side of the pool). */
  liquidity: number;
  /** Liquidity converted to USD. 0 when the USDC pool has no price. */
  liquidityUsd: number;
  totalSupply: number;
  /** Percentage change vs the oldest sample in the local price history. */
  change: number;
  history: number[];
  pair: string | null;
}


const HISTORY_KEY = 'wolfdex.market.history.v1';
const MAX_POINTS = 40;

type HistoryMap = Record<string, { t: number; p: number }[]>;

function readHistory(): HistoryMap {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') as HistoryMap; } catch { return {}; }
}
function writeHistory(h: HistoryMap) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* quota */ }
}

const ZERO = '0x0000000000000000000000000000000000000000';
/** Tokens per progressive read slice — keeps each multicall well under gas limits. */
const BATCH_SIZE = 30;
/** Slices fetched in parallel after the first one. */
const CONCURRENCY = 2;


export function useMarketData() {
  const { tokens: registry, loading: registryLoading, refresh: refreshRegistry } = useLaunchpadRegistry();
  const [metrics, setMetrics] = useState<Record<string, Omit<MarketToken, keyof IdentityFields> | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  /** USD value of 1 zkLTC, derived from the USDC pool (0 = unknown). */
  const [nativeUsd, setNativeUsd] = useState(0);


  /** Union of curated + registry tokens, de-duplicated by address. */
  const identities = useMemo<IdentityFields[]>(() => {
    const map = new Map<string, IdentityFields>();
    for (const t of TOKENS) {
      if (t.isNative) continue;
      map.set(t.address.toLowerCase(), {
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        decimals: t.decimals,
        logo: t.logo,
        verified: true,
        curated: true,
        creator: null,
        createdAt: null,
      });
    }
    for (const r of registry) {
      const key = r.address.toLowerCase();
      if (isBlockedToken(key)) continue;
      const existing = map.get(key);
      let checksum = r.address;
      try { checksum = ethers.utils.getAddress(r.address); } catch { /* keep */ }
      map.set(key, {
        address: existing?.address ?? checksum,
        name: existing?.name ?? r.name,
        symbol: existing?.symbol ?? r.symbol,
        decimals: existing?.decimals ?? r.decimals,
        logo: existing?.logo ?? (r.logo_url || '/images/wdex-logo.png'),
        verified: existing?.verified || !!r.verified,
        curated: existing?.curated ?? false,
        creator: r.creator ?? existing?.creator ?? null,
        createdAt: (r as unknown as { created_at?: string }).created_at
          ? new Date((r as unknown as { created_at: string }).created_at).getTime()
          : existing?.createdAt ?? null,
      });
    }
    return Array.from(map.values());
  }, [registry]);

  /** Reads pool + supply metrics for one slice of tokens. */
  const loadBatch = useCallback(async (addresses: IdentityFields[]) => {
    // 1) resolve each token's pool against wrapped native
    const pairRes = await multicall<string>(
      addresses.map(t => ({
        target: CONTRACTS.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPair',
        args: [t.address, CONTRACTS.WETH],
      })),
    );
    const pairs = pairRes.map(r => {
      const v = (r.result as unknown as string[] | string) ?? null;
      const addr = Array.isArray(v) ? v[0] : v;
      return addr && addr !== ZERO ? (addr as string) : null;
    });

    // 2) batch reserves + token0 + totalSupply
    type Slot = { kind: 'reserves' | 'token0' | 'supply'; i: number };
    const calls: Parameters<typeof multicall>[0] = [];
    const slots: Slot[] = [];
    addresses.forEach((t, i) => {
      const p = pairs[i];
      // Only tokens with a live pool get the deeper reads: registry entries that
      // are not real ERC20 contracts revert, and reverts are expensive on a
      // Multicall1-style aggregator (all-or-nothing ⇒ batch splitting).
      if (!p) return;
      calls.push({ target: t.address, abi: ERC20_ABI, functionName: 'totalSupply' });
      slots.push({ kind: 'supply', i });
      calls.push({ target: p, abi: PAIR_ABI, functionName: 'getReserves' });
      slots.push({ kind: 'reserves', i });
      calls.push({ target: p, abi: PAIR_ABI, functionName: 'token0' });
      slots.push({ kind: 'token0', i });
    });
    const res = await multicall(calls);

    const reserves: Record<number, [ethers.BigNumber, ethers.BigNumber]> = {};
    const token0s: Record<number, string> = {};
    const supplies: Record<number, ethers.BigNumber> = {};
    res.forEach((r, idx) => {
      const slot = slots[idx];
      if (!r.success || r.result === null) return;
      const v = r.result as unknown as any;
      if (slot.kind === 'reserves') reserves[slot.i] = [v[0], v[1]];
      else if (slot.kind === 'token0') token0s[slot.i] = String(Array.isArray(v) ? v[0] : v);
      else supplies[slot.i] = Array.isArray(v) ? v[0] : v;
    });

    const history = readHistory();
    const now = Date.now();
    const next: Record<string, any> = {};

    addresses.forEach((t, i) => {
      const key = t.address.toLowerCase();
      let price = 0;
      let liquidity = 0;
      const rv = reserves[i];
      const t0 = token0s[i];
      if (rv && t0) {
        const tokenIsToken0 = t0.toLowerCase() === key;
        const tokenReserve = tokenIsToken0 ? rv[0] : rv[1];
        const nativeReserve = tokenIsToken0 ? rv[1] : rv[0];
        const tokenAmt = parseFloat(ethers.utils.formatUnits(tokenReserve, t.decimals));
        const nativeAmt = parseFloat(ethers.utils.formatUnits(nativeReserve, 18));
        if (tokenAmt > 0) price = nativeAmt / tokenAmt;
        liquidity = nativeAmt * 2;
      }
      const supply = supplies[i]
        ? parseFloat(ethers.utils.formatUnits(supplies[i], t.decimals))
        : 0;

      // rolling history for the sparkline
      const points = history[key] ?? [];
      if (price > 0 && (points.length === 0 || now - points[points.length - 1].t > 60_000)) {
        points.push({ t: now, p: price });
      }
      history[key] = points.slice(-MAX_POINTS);
      const series = history[key].map(pt => pt.p);
      const first = series.length > 1 ? series[0] : price;
      const change = first > 0 && price > 0 ? ((price - first) / first) * 100 : 0;

      next[key] = {
        price,
        liquidity,
        totalSupply: supply,
        change,
        history: series,
        pair: pairs[i],
      };
    });

    writeHistory(history);
    return next;
  }, []);

  /**
   * Progressive load: curated tokens first, then the registry in slices, so the
   * grid fills in immediately instead of waiting on hundreds of reads.
   */
  const load = useCallback(async (addresses: IdentityFields[]) => {
    if (addresses.length === 0) { setLoading(false); return; }
    setLoading(true);
    // curated / verified assets first — they carry the reference USD pool
    const ordered = [...addresses].sort((a, b) => Number(b.curated) - Number(a.curated));
    const usdcAddr = getTokenBySymbol('USDC')?.address.toLowerCase();
    try {
      const slices: IdentityFields[][] = [];
      for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
        slices.push(ordered.slice(i, i + BATCH_SIZE));
      }
      const runSlice = async (slice: IdentityFields[]) => {
        let batch: Record<string, any> = {};
        try {
          batch = await loadBatch(slice);
        } catch { /* a bad slice must not stop the rest */ }
        setMetrics(prev => ({ ...prev, ...batch }));
        setLastUpdated(Date.now());
        if (usdcAddr && batch[usdcAddr]) {
          // USD reference: the USDC/WzkLTC pool gives "native per USDC",
          // so 1 zkLTC ≈ 1 / thatPrice dollars.
          const usdcInNative = batch[usdcAddr].price ?? 0;
          if (usdcInNative > 0) setNativeUsd(1 / usdcInNative);
        }
      };
      // First slice holds the curated assets — render it before the long tail,
      // then stream the rest with bounded concurrency.
      await runSlice(slices[0]);
      setLoading(false);
      for (let i = 1; i < slices.length; i += CONCURRENCY) {
        await Promise.all(slices.slice(i, i + CONCURRENCY).map(runSlice));
        // breathe between groups so the public RPC never rate-limits (429)
        await new Promise(r => setTimeout(r, 250));
      }
    } finally {
      setLoading(false);
    }
  }, [loadBatch]);

  useEffect(() => {
    if (registryLoading) return;
    load(identities);
  }, [identities, registryLoading, load]);


  const tokens = useMemo<MarketToken[]>(() =>
    identities.map(id => {
      const m = metrics[id.address.toLowerCase()];
      const price = m?.price ?? 0;
      const liquidity = m?.liquidity ?? 0;
      return {
        ...id,
        price,
        priceUsd: nativeUsd > 0 ? price * nativeUsd : 0,
        liquidity,
        liquidityUsd: nativeUsd > 0 ? liquidity * nativeUsd : 0,
        totalSupply: m?.totalSupply ?? 0,
        change: m?.change ?? 0,
        history: m?.history ?? [],
        pair: m?.pair ?? null,
      } as MarketToken;
    }),
  [identities, metrics, nativeUsd]);

  const refresh = useCallback(async () => {
    await refreshRegistry();
    await load(identities);
  }, [refreshRegistry, load, identities]);

  return { tokens, loading: loading || registryLoading, lastUpdated, nativeUsd, refresh };

}

interface IdentityFields {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo: string;
  verified: boolean;
  curated: boolean;
  creator: string | null;
  createdAt: number | null;
}

/** Single-token variant used by the token detail page. */
export function useMarketToken(address: string) {
  const { tokens, loading, refresh, lastUpdated, nativeUsd } = useMarketData();
  const token = useMemo(
    () => tokens.find(t => t.address.toLowerCase() === address.toLowerCase()) ?? null,
    [tokens, address],
  );
  return { token, loading, refresh, lastUpdated, nativeUsd };
}

