import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACTS, CHAIN_CONFIG, getTokenByAddress, TOKENS, isBlockedToken, RESERVED_SYMBOLS } from '@/config/contracts';
import { Link } from '@tanstack/react-router';
import { useDexContext } from '@/context/DexContext';
import CreatePairModal from './CreatePairModal';
import { WolfSkeleton, WolfSkeletonText } from './ui/WolfSkeleton';
import EmptyState from './ui/EmptyState';
import PairChart from './PairChart';

import { useTokenResolver } from '@/hooks/useTokenResolver';

interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  symbol0: string;
  symbol1: string;
  logo0: string;
  logo1: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  tvl: number;
  // synthetic / estimated metrics
  vol24h: number;
  fees24h: number;
  apr: number;
  myLp: number;
  myShare: number;
  /** True when at least one token is not in the curated TOKENS list. */
  unverified: boolean;
  /** True when the pool has no liquidity. */
  empty: boolean;
  /** True when this pool's TVL could not be priced reliably (no path to WETH). */
  tvlUnknown: boolean;
  /** True when a token spoofs a reserved/curated symbol or is on the blocklist. */
  impostor: boolean;
}

const KNOWN_ADDRS = new Set(TOKENS.map(t => t.address.toLowerCase()));

const DISPLAY_PRIORITY: Record<string, number> = {
  WDEX: 0,
  wzkLTC: 1,
  zkLTC: 2,
  ETH: 3,
  BNB: 4,
  MON: 5,
  HYPE: 6,
  LITVM: 7,
};

function isKnown(addr: string) {
  return KNOWN_ADDRS.has(addr.toLowerCase());
}

function compareDisplayTokens(
  a: { address: string; symbol: string; known: boolean },
  b: { address: string; symbol: string; known: boolean },
) {
  const rankA = DISPLAY_PRIORITY[a.symbol] ?? (a.known ? 50 : 100);
  const rankB = DISPLAY_PRIORITY[b.symbol] ?? (b.known ? 50 : 100);
  if (rankA !== rankB) return rankA - rankB;
  const symbolCmp = a.symbol.localeCompare(b.symbol);
  if (symbolCmp !== 0) return symbolCmp;
  return a.address.toLowerCase().localeCompare(b.address.toLowerCase());
}

type SortKey = 'tvl' | 'vol' | 'apr' | 'name';
type ViewMode = 'grid' | 'list';

// Deterministic pseudo-random based on pair address — keeps numbers stable
// across renders so the page does not "flicker" different values.
function hashToFloat(s: string, salt: number) {
  let h = salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 10000) / 10000;
}

export default function PoolsView({ isConnected }: { isConnected: boolean }) {
  const { wallet, dex, getCachedPairsWithInfo, invalidatePairsCache } = useDexContext();
  const { resolve } = useTokenResolver();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('tvl');
  const [view, setView] = useState<ViewMode>('grid');
  const [onlyMine, setOnlyMine] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [chartPool, setChartPool] = useState<PoolInfo | null>(null);

  const [hideEmpty, setHideEmpty] = useState(true);
  const [hideUnverified, setHideUnverified] = useState(true);
  const [hideImpostors, setHideImpostors] = useState(true);

  const loadPools = useCallback(async (force = false) => {
    setLoading(prev => prev || pools.length === 0);
    try {
      const cache = await getCachedPairsWithInfo(force);
      const myLpBalances: string[] = wallet.address && cache.pairs.length > 0
        ? await dex.getMultipleBalances(cache.pairs).catch(() => [])
        : [];

      // ---- Step 1: build a price map (token -> WETH) using WETH-paired pools ----
      const wethAddr = CONTRACTS.WETH.toLowerCase();
      const priceInWeth: Record<string, number> = { [wethAddr]: 1 };
      cache.pairs.forEach(addr => {
        const info = cache.infos[addr];
        if (!info) return;
        const t0 = info.token0.toLowerCase();
        const t1 = info.token1.toLowerCase();
        const r0 = parseFloat(info.reserve0);
        const r1 = parseFloat(info.reserve1);
        if (r0 <= 0 || r1 <= 0) return;
        if (t0 === wethAddr && !priceInWeth[t1]) priceInWeth[t1] = r0 / r1;
        else if (t1 === wethAddr && !priceInWeth[t0]) priceInWeth[t0] = r1 / r0;
      });
      // Second pass: derive prices via any token that already has a WETH price.
      for (let pass = 0; pass < 2; pass++) {
        cache.pairs.forEach(addr => {
          const info = cache.infos[addr];
          if (!info) return;
          const t0 = info.token0.toLowerCase();
          const t1 = info.token1.toLowerCase();
          const r0 = parseFloat(info.reserve0);
          const r1 = parseFloat(info.reserve1);
          if (r0 <= 0 || r1 <= 0) return;
          if (priceInWeth[t0] && !priceInWeth[t1]) priceInWeth[t1] = (r0 * priceInWeth[t0]) / r1;
          else if (priceInWeth[t1] && !priceInWeth[t0]) priceInWeth[t0] = (r1 * priceInWeth[t1]) / r0;
        });
      }

      // ---- Step 2: detect symbol collisions for disambiguation ----
      const symbolCount: Record<string, number> = {};
      cache.pairs.forEach(addr => {
        const info = cache.infos[addr];
        if (!info) return;
        for (const tk of [info.token0, info.token1]) {
          const sym = resolve(tk).symbol;
          symbolCount[sym] = (symbolCount[sym] || 0) + 1;
          // count a token only once
        }
      });
      // Track which addresses share each symbol
      const addrsPerSymbol: Record<string, Set<string>> = {};
      cache.pairs.forEach(addr => {
        const info = cache.infos[addr];
        if (!info) return;
        for (const tk of [info.token0, info.token1]) {
          const sym = resolve(tk).symbol;
          if (!addrsPerSymbol[sym]) addrsPerSymbol[sym] = new Set();
          addrsPerSymbol[sym].add(tk.toLowerCase());
        }
      });
      const disambiguate = (tkAddr: string, sym: string) => {
        const lc = tkAddr.toLowerCase();
        const symLc = sym.toLowerCase();
        // 1. If token is in curated list → trust the symbol as-is
        if (KNOWN_ADDRS.has(lc)) return sym;
        // 2. If symbol is reserved by a curated token at a different address → impostor
        const reservedAddr = RESERVED_SYMBOLS[symLc];
        if (reservedAddr !== undefined && reservedAddr !== lc) {
          return `${sym}·SPOOF`;
        }
        // 3. If multiple unknown contracts use the same symbol → suffix with addr fragment
        const set = addrsPerSymbol[sym];
        if (set && set.size > 1) {
          return `${sym}·${tkAddr.slice(2, 6)}`;
        }
        return sym;
      };

      const isImpostorToken = (tkAddr: string, sym: string) => {
        const lc = tkAddr.toLowerCase();
        if (isBlockedToken(lc)) return true;
        if (KNOWN_ADDRS.has(lc)) return false;
        const reservedAddr = RESERVED_SYMBOLS[sym.toLowerCase()];
        return reservedAddr !== undefined && reservedAddr !== lc;
      };

      const out: PoolInfo[] = [];
      cache.pairs.forEach((addr, i) => {
        const info = cache.infos[addr];
        if (!info) return;
        const t0 = resolve(info.token0);
        const t1 = resolve(info.token1);
        const r0 = parseFloat(info.reserve0);
        const r1 = parseFloat(info.reserve1);
        const empty = r0 <= 0 || r1 <= 0;
        const p0 = priceInWeth[info.token0.toLowerCase()];
        const p1 = priceInWeth[info.token1.toLowerCase()];
        let tvl = 0;
        let tvlUnknown = false;
        if (empty) {
          tvl = 0;
        } else if (p0 && p1) {
          // TVL in WETH (≈ zkLTC) units. Treat zkLTC as $1 placeholder.
          tvl = r0 * p0 + r1 * p1;
        } else if (p0) {
          tvl = 2 * r0 * p0;
        } else if (p1) {
          tvl = 2 * r1 * p1;
        } else {
          tvlUnknown = true;
          tvl = 0;
        }
        const displayA = {
          address: info.token0,
          symbol: disambiguate(info.token0, t0.symbol),
          logo: t0.logo,
          reserve: r0.toString(),
          known: isKnown(info.token0),
        };
        const displayB = {
          address: info.token1,
          symbol: disambiguate(info.token1, t1.symbol),
          logo: t1.logo,
          reserve: r1.toString(),
          known: isKnown(info.token1),
        };
        const [first, second] = compareDisplayTokens(displayA, displayB) <= 0
          ? [displayA, displayB]
          : [displayB, displayA];

        const turnover = 0.04 + hashToFloat(addr, 7) * 0.18;
        const vol24h = tvl * turnover;
        const fees24h = vol24h * 0.003;
        const apr = tvl > 0 ? (fees24h * 365 / tvl) * 100 : 0;
        const myLpStr = myLpBalances[i] || '0';
        const myLp = parseFloat(myLpStr);
        const supply = parseFloat(info.totalSupply) || 0;
        const unverified = !isKnown(info.token0) || !isKnown(info.token1);
        const impostor =
          isImpostorToken(info.token0, t0.symbol) ||
          isImpostorToken(info.token1, t1.symbol);
        out.push({
          address: addr,
          token0: first.address,
          token1: second.address,
          symbol0: first.symbol,
          symbol1: second.symbol,
          logo0: first.logo,
          logo1: second.logo,
          reserve0: first.reserve,
          reserve1: second.reserve,
          totalSupply: info.totalSupply,
          tvl,
          vol24h,
          fees24h,
          apr,
          myLp,
          myShare: supply > 0 ? (myLp / supply) * 100 : 0,
          unverified,
          empty,
          tvlUnknown,
          impostor,
        });
      });
      setPools(out);
    } catch {} finally { setLoading(false); }
  }, [getCachedPairsWithInfo, dex, wallet.address, pools.length, resolve]);

  useEffect(() => { loadPools(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // After first load, retry resolution after 1.5s so on-chain ERC20 symbol
  // lookups (fired by the resolver in the background) get reflected in the UI.
  useEffect(() => {
    if (pools.length === 0) return;
    const hasUnknown = pools.some(p => p.symbol0.includes('…') || p.symbol1.includes('…') || p.symbol0.startsWith('0x') || p.symbol1.startsWith('0x'));
    if (!hasUnknown) return;
    const t = setTimeout(() => loadPools(false), 1500);
    return () => clearTimeout(t);
  }, [pools, loadPools]);


  // Totals: only count "trustworthy" pools — non-empty, priced, and verified.
  // Otherwise scam tokens with huge fake reserves balloon the headline numbers.
  const trustworthy = useMemo(
    () => pools.filter(p => !p.empty && !p.tvlUnknown && !p.unverified && !p.impostor),
    [pools],
  );
  const totalTVL = useMemo(() => trustworthy.reduce((s, p) => s + p.tvl, 0), [trustworthy]);
  const totalVol = useMemo(() => trustworthy.reduce((s, p) => s + p.vol24h, 0), [trustworthy]);
  const totalFees = useMemo(() => trustworthy.reduce((s, p) => s + p.fees24h, 0), [trustworthy]);
  const myPositionsCount = useMemo(() => pools.filter(p => p.myLp > 0).length, [pools]);
  const impostorCount = useMemo(() => pools.filter(p => p.impostor).length, [pools]);

  const filtered = useMemo(() => {
    let list = pools.filter(p =>
      p.symbol0.toLowerCase().includes(search.toLowerCase()) ||
      p.symbol1.toLowerCase().includes(search.toLowerCase())
    );
    if (onlyMine) list = list.filter(p => p.myLp > 0);
    if (hideEmpty) list = list.filter(p => !p.empty);
    if (hideUnverified) list = list.filter(p => !p.unverified);
    if (hideImpostors) list = list.filter(p => !p.impostor);
    list.sort((a, b) => {
      // Always demote impostor / empty / unknown pools to the bottom regardless of sort key
      if (a.impostor !== b.impostor) return a.impostor ? 1 : -1;
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      if (a.tvlUnknown !== b.tvlUnknown) return a.tvlUnknown ? 1 : -1;
      switch (sortBy) {
        case 'tvl': return b.tvl - a.tvl;
        case 'vol': return b.vol24h - a.vol24h;
        case 'apr': return b.apr - a.apr;
        case 'name': return `${a.symbol0}/${a.symbol1}`.localeCompare(`${b.symbol0}/${b.symbol1}`);
      }
    });
    return list;
  }, [pools, search, sortBy, onlyMine, hideEmpty, hideUnverified, hideImpostors]);

  const showSkeleton = loading && pools.length === 0;

  const fmt$ = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(2)}k` : `$${n.toFixed(2)}`;
  const fmtTvl = (p: PoolInfo) => p.tvlUnknown ? '—' : fmt$(p.tvl);
  const fmtVol = (p: PoolInfo) => p.tvlUnknown ? '—' : fmt$(p.vol24h);
  const fmtFees = (p: PoolInfo) => p.tvlUnknown ? '—' : fmt$(p.fees24h);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8 relative">
        <div className="spotlight w-[480px] h-[260px] -top-8 left-1/2 -translate-x-1/2" />
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-2 relative">Liquidity Pools</h1>
        <p className="text-muted-foreground text-sm relative">Explore pools, track your positions, and earn 0.3% trading fees</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: '🏊', label: `Verified Pools`, value: `${trustworthy.length} / ${pools.length}`, color: 'from-wolf-pink/20 to-wolf-pink/5' },
          { icon: '💰', label: 'Total TVL (verified)', value: fmt$(totalTVL), color: 'from-wolf-gold/20 to-wolf-gold/5' },
          { icon: '📊', label: '24h Volume (est)', value: fmt$(totalVol), color: 'from-wolf-green/20 to-wolf-green/5' },
          { icon: '💎', label: '24h Fees (est)', value: fmt$(totalFees), color: 'from-cyan-500/20 to-cyan-500/5' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`wolf-stat-card rounded-xl p-4 bg-gradient-to-br ${s.color} relative overflow-hidden`}
          >
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-lg font-bold mt-0.5">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Search & filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px] relative">
          <input type="text" placeholder="🔍 Search by symbol (e.g. WDEX, zkLTC)..." value={search} onChange={e => setSearch(e.target.value)}
            className="wolf-input w-full px-4 py-2.5 rounded-xl text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm">×</button>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-wolf-surface border border-wolf-border/30">
          {([
            { k: 'tvl', label: '💰 TVL' },
            { k: 'vol', label: '📊 Vol' },
            { k: 'apr', label: '⚡ APR' },
            { k: 'name', label: '🔤 Name' },
          ] as const).map(s => (
            <button key={s.k} onClick={() => setSortBy(s.k)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${sortBy === s.k ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground hover:text-foreground'}`}
            >{s.label}</button>
          ))}
        </div>
        {isConnected && (
          <button onClick={() => setOnlyMine(v => !v)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${onlyMine
              ? 'bg-wolf-gold/20 text-wolf-gold border-wolf-gold/50'
              : 'bg-wolf-surface border-wolf-border/30 text-muted-foreground hover:text-foreground'}`}
          >
            ⭐ My Positions {myPositionsCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-wolf-gold/20 text-[9px]">{myPositionsCount}</span>}
          </button>
        )}
        <button onClick={() => setHideEmpty(v => !v)}
          title={hideEmpty ? 'Show empty pools' : 'Hide empty (zero-liquidity) pools'}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${hideEmpty
            ? 'bg-wolf-surface border-wolf-border/30 text-muted-foreground hover:text-foreground'
            : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'}`}
        >
          {hideEmpty ? '🚫 Empty' : '👁 Empty'}
        </button>
        <button onClick={() => setHideUnverified(v => !v)}
          title={hideUnverified ? 'Show unverified-token pools' : 'Hide pools with unknown / unverified tokens'}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${hideUnverified
            ? 'bg-wolf-pink/15 text-wolf-pink border-wolf-pink/40'
            : 'bg-wolf-surface border-wolf-border/30 text-muted-foreground hover:text-foreground'}`}
        >
          {hideUnverified ? '🛡 Verified only' : '⚠ Unverified'}
        </button>
        <button onClick={() => setHideImpostors(v => !v)}
          title={hideImpostors ? 'Reveal impostor / scam pools' : 'Hide pools containing tokens that spoof a curated symbol or are blocklisted'}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${hideImpostors
            ? 'bg-red-500/10 text-red-300 border-red-500/40'
            : 'bg-wolf-surface border-wolf-border/30 text-muted-foreground hover:text-foreground'}`}
        >
          {hideImpostors ? `🛑 Hiding ${impostorCount} scam${impostorCount === 1 ? '' : 's'}` : '👁 Show scams'}
        </button>
        <div className="flex gap-1 p-1 rounded-lg bg-wolf-surface border border-wolf-border/30">
          {(['grid', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-bold transition-all ${view === v ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground'}`}
              title={v === 'grid' ? 'Grid view' : 'Table view'}
            >{v === 'grid' ? '▦' : '☰'}</button>
          ))}
        </div>
        <button onClick={() => { invalidatePairsCache(); loadPools(true); }} className="px-3 py-2 rounded-lg text-xs font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all text-muted-foreground hover:text-foreground">
          🔄
        </button>
        <button onClick={() => setShowCreate(true)} className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-semibold">
          + Create Pair
        </button>
      </div>

      {/* Pool list/cards */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wolf-pool-card rounded-xl p-4 space-y-3" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <WolfSkeleton flat className="w-8 h-8 rounded-full" />
                  <WolfSkeleton flat className="w-8 h-8 rounded-full" />
                </div>
                <WolfSkeleton flat className="h-3 w-24 rounded" />
              </div>
              <WolfSkeletonText lines={2} />
              <div className="flex justify-between pt-3 border-t border-wolf-border/20">
                <WolfSkeleton flat className="h-3 w-20 rounded" />
                <WolfSkeleton flat className="h-7 w-24 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji={onlyMine ? '⭐' : '🌊'}
          title={onlyMine ? 'No LP positions yet' : 'No pools match your search'}
          description={onlyMine
            ? 'Drop liquidity into any pair to start earning 0.3% trading fees and stake LP tokens in farms.'
            : 'Try a different symbol, switch the filters, or be the first to spawn a brand new pair.'}
          actions={
            <>
              <Link to="/liquidity" className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-bold wolf-shimmer-hover">💧 Add Liquidity</Link>
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg text-xs font-semibold bg-wolf-surface border border-wolf-border/40 hover:border-wolf-pink/40 transition-all">+ Create Pair</button>
            </>
          }
        />
      ) : view === 'list' ? (
        <div className="wolf-card rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] uppercase tracking-wider text-muted-foreground bg-wolf-surface/40 border-b border-wolf-border/20 font-semibold">
            <div className="col-span-3">Pair</div>
            <div className="col-span-2 text-right">TVL</div>
            <div className="col-span-2 text-right">24h Vol</div>
            <div className="col-span-2 text-right">24h Fees</div>
            <div className="col-span-1 text-right">APR</div>
            <div className="col-span-2 text-right">Action</div>
          </div>
          {filtered.map(pool => (
            <div key={pool.address} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm border-b border-wolf-border/10 last:border-0 hover:bg-wolf-surface/30 transition-colors">
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <div className="flex -space-x-2 shrink-0">
                  <img src={pool.logo0} alt="" className="w-7 h-7 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  <img src={pool.logo1} alt="" className="w-7 h-7 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate flex items-center gap-1.5">
                    <span>{pool.symbol0}/{pool.symbol1}</span>
                    {pool.impostor && <span title="Impostor: token spoofs a curated symbol or is blocklisted" className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/40">🛑 SCAM</span>}
                    {pool.unverified && !pool.impostor && <span title="Contains unverified token" className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">⚠</span>}
                    {pool.empty && <span title="No liquidity yet" className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-wolf-border/30">EMPTY</span>}
                  </div>
                  {pool.myLp > 0 && <div className="text-[10px] text-wolf-gold">⭐ {pool.myShare.toFixed(2)}% mine</div>}
                </div>
              </div>
              <div className="col-span-2 text-right font-bold">{fmtTvl(pool)}</div>
              <div className="col-span-2 text-right text-muted-foreground">{fmtVol(pool)}</div>
              <div className="col-span-2 text-right text-cyan-400">{fmtFees(pool)}</div>
              <div className="col-span-1 text-right text-wolf-green font-bold">{pool.tvlUnknown ? '—' : `${pool.apr.toFixed(1)}%`}</div>
              <div className="col-span-2 flex justify-end gap-1.5">
                <button onClick={() => setChartPool(pool)} className="px-2 py-1 rounded-md text-[10px] bg-wolf-surface border border-wolf-gold/30 hover:border-wolf-gold hover:text-wolf-gold transition">📊</button>
                <Link to="/liquidity" className="px-2.5 py-1 rounded-md text-[10px] font-bold wolf-btn-primary">Add</Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((pool, i) => (
            <div
              key={pool.address}
              style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}
              className="wolf-pool-rise wolf-pool-card wolf-lift rounded-xl p-4 relative"
            >
              <div className="absolute top-2 right-2 flex gap-1">
                {pool.impostor && (
                  <span title="Impostor: token spoofs a curated symbol or is blocklisted. Do NOT trade." className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                    🛑 SCAM
                  </span>
                )}
                {pool.unverified && !pool.impostor && (
                  <span title="Pool contains an unverified / unknown ERC20 token. Trade with caution." className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ⚠ UNVERIFIED
                  </span>
                )}
                {pool.empty && (
                  <span title="Pool has no liquidity yet" className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-muted/30 text-muted-foreground border border-wolf-border/40">
                    EMPTY
                  </span>
                )}
                {pool.myLp > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-wolf-gold/20 text-wolf-gold border border-wolf-gold/40">
                    ⭐ MINE
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <img src={pool.logo0} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <img src={pool.logo1} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  </div>
                  <div>
                    <span className="font-bold text-sm">{pool.symbol0}/{pool.symbol1}</span>
                    <div className="text-[10px] text-muted-foreground">Fee 0.3% · APR <span className="text-wolf-green font-bold">{pool.tvlUnknown ? '—' : `${pool.apr.toFixed(1)}%`}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">TVL</div>
                  <div className="font-bold text-xs mt-0.5">{fmtTvl(pool)}</div>
                </div>
                <div className="bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">24h Vol</div>
                  <div className="font-bold text-xs mt-0.5">{fmtVol(pool)}</div>
                </div>
                <div className="bg-wolf-surface/40 rounded-lg p-2 border border-cyan-500/20">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">24h Fees</div>
                  <div className="font-bold text-xs mt-0.5 text-cyan-400">{fmtFees(pool)}</div>
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <img src={pool.logo0} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <span className="text-muted-foreground">{pool.symbol0}</span>
                  </div>
                  <span className="font-medium">{parseFloat(pool.reserve0).toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <img src={pool.logo1} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <span className="text-muted-foreground">{pool.symbol1}</span>
                  </div>
                  <span className="font-medium">{parseFloat(pool.reserve1).toFixed(4)}</span>
                </div>
              </div>

              {pool.myLp > 0 && (
                <div className="rounded-lg p-2 mb-3 bg-gradient-to-r from-wolf-gold/10 to-wolf-pink/10 border border-wolf-gold/30">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-muted-foreground">Your LP</span>
                    <span className="font-bold text-wolf-gold">{pool.myLp.toFixed(6)} ({pool.myShare.toFixed(3)}%)</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-wolf-border/20">
                <span className="text-[10px] text-muted-foreground">Pair: {pool.address.slice(0, 6)}…{pool.address.slice(-4)}</span>
                <div className="flex gap-2">
                  <button onClick={() => setChartPool(pool)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-wolf-surface border border-wolf-gold/30 hover:border-wolf-gold hover:text-wolf-gold transition-all"
                  >📊 Chart</button>
                  <a href={`${CHAIN_CONFIG.blockExplorer}/address/${pool.address}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all"
                  >↗</a>
                  <Link to="/liquidity"
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium wolf-btn-primary"
                  >Add</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreatePairModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        signer={wallet.signer}
        onCreated={() => { invalidatePairsCache(); loadPools(true); }}
      />

      <AnimatePresence>
        {chartPool && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setChartPool(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="wolf-card rounded-2xl p-5 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <img src={chartPool.logo0} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <img src={chartPool.logo1} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{chartPool.symbol0}/{chartPool.symbol1}</h3>
                    <a href={`${CHAIN_CONFIG.blockExplorer}/address/${chartPool.address}`} target="_blank" rel="noreferrer"
                      className="text-[10px] font-mono text-muted-foreground hover:text-wolf-gold transition-colors">
                      {chartPool.address.slice(0, 10)}…{chartPool.address.slice(-8)} ↗
                    </a>
                  </div>
                </div>
                <button onClick={() => setChartPool(null)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
              </div>
              <PairChart
                pairAddress={chartPool.address}
                baseSymbol={chartPool.symbol0}
                quoteSymbol={chartPool.symbol1}
                height={380}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
