import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACTS, CHAIN_CONFIG, getTokenByAddress } from '@/config/contracts';
import { Link } from '@tanstack/react-router';
import { useDexContext } from '@/context/DexContext';
import CreatePairModal from './CreatePairModal';
import { WolfSkeleton, WolfSkeletonText } from './ui/WolfSkeleton';
import PairChart from './PairChart';

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
}

export default function PoolsView({ isConnected }: { isConnected: boolean }) {
  const { wallet, getCachedPairsWithInfo, invalidatePairsCache } = useDexContext();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'tvl' | 'name'>('tvl');
  const [showCreate, setShowCreate] = useState(false);
  const [chartPool, setChartPool] = useState<PoolInfo | null>(null);

  const loadPools = useCallback(async (force = false) => {
    // Only show skeleton when we don't already have data — keeps navigation instant
    setLoading(prev => prev || pools.length === 0);
    try {
      const cache = await getCachedPairsWithInfo(force);
      const out: PoolInfo[] = [];
      for (const addr of cache.pairs) {
        const info = cache.infos[addr];
        if (!info) continue;
        const t0 = getTokenByAddress(info.token0);
        const t1 = getTokenByAddress(info.token1);
        const r0 = parseFloat(info.reserve0);
        const r1 = parseFloat(info.reserve1);
        out.push({
          address: addr,
          token0: info.token0,
          token1: info.token1,
          symbol0: t0?.symbol || info.token0.slice(0, 8),
          symbol1: t1?.symbol || info.token1.slice(0, 8),
          logo0: t0?.logo || '/images/wdex-logo.png',
          logo1: t1?.logo || '/images/wdex-logo.png',
          reserve0: r0.toString(),
          reserve1: r1.toString(),
          totalSupply: info.totalSupply,
          tvl: r0 + r1,
        });
      }
      setPools(out);
    } catch {} finally { setLoading(false); }
  }, [getCachedPairsWithInfo, pools.length]);

  useEffect(() => { loadPools(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalTVL = useMemo(() => pools.reduce((s, p) => s + p.tvl, 0), [pools]);
  const filtered = useMemo(() => pools.filter(p =>
    p.symbol0.toLowerCase().includes(search.toLowerCase()) ||
    p.symbol1.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => sortBy === 'tvl' ? b.tvl - a.tvl : `${a.symbol0}/${a.symbol1}`.localeCompare(`${b.symbol0}/${b.symbol1}`)), [pools, search, sortBy]);

  const showSkeleton = loading && pools.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-2">Liquidity Pools</h1>
        <p className="text-muted-foreground text-sm">Explore and provide liquidity to earn trading fees</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { icon: '🏊', label: 'Total Pools', value: pools.length.toString() },
          { icon: '💰', label: 'Total TVL', value: `$${totalTVL.toFixed(2)}` },
          { icon: '📊', label: '24h Volume', value: '$0.00' },
          { icon: '🔥', label: 'Network', value: 'LitVM' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="wolf-stat-card rounded-xl p-4"
          >
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-lg font-bold mt-0.5">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Search & filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px]">
          <input type="text" placeholder="🔍 Search pools..." value={search} onChange={e => setSearch(e.target.value)}
            className="wolf-input w-full px-4 py-2.5 rounded-xl text-sm"
          />
        </div>
        <div className="flex gap-2">
          {['tvl', 'name'].map(s => (
            <button key={s} onClick={() => setSortBy(s as any)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${sortBy === s ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40' : 'bg-wolf-surface border border-wolf-border/30 text-muted-foreground'}`}
            >{s === 'tvl' ? '💰 TVL' : '📝 Name'}</button>
          ))}
        </div>
        <button onClick={() => { invalidatePairsCache(); loadPools(true); }} className="px-3 py-2 rounded-lg text-xs font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all text-muted-foreground hover:text-foreground">
          🔄 Refresh
        </button>
        <button onClick={() => setShowCreate(true)} className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-semibold">
          + Create Pair
        </button>
      </div>

      {/* Pool cards */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="wolf-pool-card rounded-xl p-4 space-y-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <WolfSkeleton flat className="w-8 h-8 rounded-full" />
                  <WolfSkeleton flat className="w-8 h-8 rounded-full" />
                </div>
                <WolfSkeleton flat className="h-3 w-24 rounded" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <WolfSkeleton flat className="h-2.5 w-12 rounded" />
                  <WolfSkeleton flat className="h-4 w-16 rounded" />
                </div>
                <div className="space-y-1.5 text-right items-end flex flex-col">
                  <WolfSkeleton flat className="h-2.5 w-10 rounded" />
                  <WolfSkeleton flat className="h-4 w-14 rounded" />
                </div>
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
        <div className="wolf-card rounded-2xl p-12 text-center">
          <p className="text-muted-foreground text-lg">No pools found</p>
          <p className="text-sm text-muted-foreground mt-2">Be the first to add liquidity!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((pool, i) => (
            <motion.div key={pool.address} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}
              className="wolf-pool-card rounded-xl p-4"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    <img src={pool.logo0} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <img src={pool.logo1} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  </div>
                  <div>
                    <span className="font-bold text-sm">{pool.symbol0}/{pool.symbol1}</span>
                    <div className="text-[10px] text-muted-foreground">Fee: 0.3% · <span className="text-wolf-green">+0.00%</span></div>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">💰 TVL</div>
                  <div className="font-bold text-sm">${pool.tvl.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">APY</div>
                  <div className="font-bold text-sm text-wolf-green">0.00%</div>
                </div>
              </div>

              {/* Reserves */}
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

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-wolf-border/20">
                <span className="text-[10px] text-muted-foreground">24h Vol: $0.00</span>
                <div className="flex gap-2">
                  <button onClick={() => setChartPool(pool)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-wolf-surface border border-wolf-gold/30 hover:border-wolf-gold hover:text-wolf-gold transition-all"
                  >📊 Chart</button>
                  <a href={`${CHAIN_CONFIG.blockExplorer}/address/${pool.address}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all"
                  >Details</a>
                  <Link to="/liquidity"
                    className="px-3 py-1.5 rounded-lg text-[10px] font-medium wolf-btn-primary"
                  >Add Liquidity</Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <CreatePairModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        signer={wallet.signer}
        onCreated={() => { invalidatePairsCache(); loadPools(true); }}
      />

      {/* Pool OHLC Chart Modal */}
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
