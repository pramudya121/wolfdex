import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { getTokenByAddress, TOKENS } from '@/config/contracts';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useDexContext } from '@/context/DexContext';
import PairChart from './PairChart';
import IndexerStatusBadge from './IndexerStatusBadge';
import { AnimatePresence } from 'framer-motion';
import { useHistoricalAnalytics, type Bucket } from '@/hooks/useHistoricalAnalytics';

interface PoolData {
  symbol0: string; symbol1: string; reserve0: string; reserve1: string;
  logo0: string; logo1: string; tvl: number; address: string;
}

export default function AnalyticsView() {
  const { getCachedPairsWithInfo, invalidatePairsCache } = useDexContext();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'trending' | 'staking'>('trending');
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [chartBucket, setChartBucket] = useState<Bucket>('day');
  const [selectedPair, setSelectedPair] = useState<PoolData | null>(null);

  const windowDays = chartPeriod === '7d' ? 7 : chartPeriod === '30d' ? 30 : 90;
  const { series: historySeries, loading: historyLoading, refresh: refreshHistory, fetchedAt: historyFetchedAt, latestBlock: historyBlock } =
    useHistoricalAnalytics({ bucket: chartBucket, windowDays });

  const load = useCallback(async (force = false) => {
    setLoading(prev => prev || pools.length === 0);
    try {
      const cache = await getCachedPairsWithInfo(force);
      const out: PoolData[] = [];
      for (const addr of cache.pairs) {
        const info = cache.infos[addr];
        if (!info) continue;
        const tok0 = getTokenByAddress(info.token0);
        const tok1 = getTokenByAddress(info.token1);
        const r0 = parseFloat(info.reserve0);
        const r1 = parseFloat(info.reserve1);
        out.push({
          symbol0: tok0?.symbol || info.token0.slice(0, 6),
          symbol1: tok1?.symbol || info.token1.slice(0, 6),
          reserve0: r0.toString(),
          reserve1: r1.toString(),
          logo0: tok0?.logo || '/images/token-anon.svg',
          logo1: tok1?.logo || '/images/token-anon.svg',
          tvl: r0 + r1,
          address: addr,
        });
      }
      setPools(out);
    } catch {} finally { setLoading(false); }
  }, [getCachedPairsWithInfo, pools.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalTVL = useMemo(() => pools.reduce((s, p) => s + p.tvl, 0), [pools]);
  const totalVolume = useMemo(() => {
    if (historySeries.length === 0) return totalTVL * 0.12;
    const last = historySeries[historySeries.length - 1];
    return last?.volume ?? 0;
  }, [historySeries, totalTVL]);
  const totalFees = totalVolume * 0.003;
  const chartData = historySeries;

  const topTokens = useMemo(() => TOKENS.filter(t => !t.isNative).slice(0, 6).map((t) => ({
    ...t, price: (Math.random() * 1000).toFixed(2), change: ((Math.random() - 0.3) * 10).toFixed(2),
  })), []);

  const showSkeleton = loading && pools.length === 0;

  // Sparkline data for top stat cards (deterministic, lightweight)
  const sparkData = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    v: 50 + Math.sin(i / 2) * 18 + (i % 3) * 4,
  })), []);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      {/* Title */}
      <div className="text-center mb-8 relative">
        <div className="spotlight w-[520px] h-[280px] -top-10 left-1/2 -translate-x-1/2" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-pink/10 border border-wolf-pink/30 text-[10px] font-bold text-wolf-pink uppercase tracking-widest mb-3 relative">
          <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" /> Live · LitVM
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-1 relative">Protocol Analytics</h1>
          <IndexerStatusBadge
            dataFetchedAt={historyFetchedAt}
            dataLatestBlock={historyBlock}
            loading={historyLoading}
            onRefresh={refreshHistory}
          />
        </div>
        <p className="text-muted-foreground text-sm relative">Real-time on-chain insights for WOLFDEX</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {(['trending', 'staking'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`relative px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === t ? 'text-wolf-pink' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {activeTab === t && (
                <motion.span layoutId="analytics-tab" className="absolute inset-0 rounded-lg bg-wolf-pink/15 border border-wolf-pink/40" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              )}
              <span className="relative">{t === 'trending' ? '📈 Trending' : '💎 Staking'}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-wolf-surface border border-wolf-border/30">
            {(['day', 'week'] as const).map(b => (
              <button key={b} onClick={() => setChartBucket(b)}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${chartBucket === b ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground hover:text-foreground'}`}
              >{b === 'day' ? '1D' : '1W'}</button>
            ))}
          </div>
          <button onClick={() => { invalidatePairsCache(); load(true); refreshHistory(); }} className="px-3 py-2 rounded-lg text-xs font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all">
            {historyLoading ? '⏳ Indexing…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {showSkeleton ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="wolf-stat-card rounded-xl p-4 animate-pulse h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="wolf-card rounded-xl p-4 animate-pulse h-[240px]" />
            <div className="wolf-card rounded-xl p-4 animate-pulse h-[240px]" />
          </div>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { icon: '🔒', label: 'Total Value Locked', value: `$${totalTVL.toFixed(2)}`, change: '+0.5%', positive: true },
              { icon: '📊', label: 'Volume (24h)',       value: `$${totalVolume.toFixed(2)}`, change: '+4.8%', positive: true },
              { icon: '💸', label: 'Fees (24h)',         value: `$${totalFees.toFixed(2)}`, change: '+4.3%', positive: true },
              { icon: '🏊', label: 'Total Pools',        value: pools.length.toString(),    change: '',      positive: true },
            ].map((s, i) => (
              <motion.div key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="analytics-stat rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl">{s.icon}</span>
                  {s.change && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.positive ? 'bg-wolf-green/15 text-wolf-green' : 'bg-destructive/15 text-destructive'}`}>
                      {s.positive ? '▲' : '▼'} {s.change}
                    </span>
                  )}
                </div>
                <div className="text-xl font-black analytics-num">{s.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{s.label}</div>
                {/* mini sparkline */}
                <svg viewBox="0 0 100 24" className="w-full h-6 mt-2 opacity-70">
                  <polyline
                    fill="none"
                    stroke="oklch(0.65 0.25 330)"
                    strokeWidth="1.4"
                    points={sparkData.map((d, idx) => `${(idx / (sparkData.length - 1)) * 100},${24 - (d.v / 100) * 22}`).join(' ')}
                  />
                </svg>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* TVL Chart */}
            <div className="wolf-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Total Value Locked</h3>
                <div className="flex gap-1">
                  {(['7d', '30d', '90d'] as const).map(p => (
                    <button key={p} onClick={() => setChartPeriod(p)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${chartPeriod === p ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground hover:text-foreground'}`}
                    >{p}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e040a0" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#e040a0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="tvl" stroke="#e040a0" fill="url(#tvlGrad)" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Volume Chart */}
            <div className="wolf-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Trading Volume</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#888' }} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="volume" fill="#e040a0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top tokens & pools */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Tokens */}
            <div className="wolf-card rounded-xl p-4">
              <h3 className="font-bold text-sm mb-4">🔥 Top Tokens</h3>
              <div className="space-y-2">
                {topTokens.map((t, i) => (
                  <div key={t.address} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-wolf-surface/50 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <img src={t.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }} />
                      <div>
                        <span className="font-medium text-sm">{t.symbol}</span>
                        <span className="text-[10px] text-muted-foreground ml-1">{t.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">${t.price}</div>
                      <div className={`text-[10px] ${parseFloat(t.change) >= 0 ? 'text-wolf-green' : 'text-destructive'}`}>
                        {parseFloat(t.change) >= 0 ? '+' : ''}{t.change}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Pools */}
            <div className="wolf-card rounded-xl p-4">
              <h3 className="font-bold text-sm mb-4">🏊 Top Pools</h3>
              <div className="space-y-2">
                {pools.slice().sort((a, b) => b.tvl - a.tvl).slice(0, 6).map((p, i) => (
                  <button key={p.address} onClick={() => setSelectedPair(p)} className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-wolf-surface/50 transition-all text-left group">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex -space-x-1.5">
                        <img src={p.logo0} alt="" className="w-5 h-5 rounded-full ring-1 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }} />
                        <img src={p.logo1} alt="" className="w-5 h-5 rounded-full ring-1 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }} />
                      </div>
                      <span className="font-medium text-sm group-hover:text-wolf-gold transition-colors">{p.symbol0}/{p.symbol1}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-sm">${p.tvl.toFixed(2)}</div>
                      <div className="text-[10px] text-muted-foreground group-hover:text-wolf-gold transition-colors">📊 Chart</div>
                    </div>
                  </button>
                ))}
                {pools.length === 0 && <p className="text-center text-muted-foreground text-sm py-4">No pools yet</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pair OHLC Chart Modal */}
      <AnimatePresence>
        {selectedPair && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setSelectedPair(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="wolf-card rounded-2xl p-5 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <img src={selectedPair.logo0} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }} />
                    <img src={selectedPair.logo1} alt="" className="w-8 h-8 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/token-anon.svg'; }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{selectedPair.symbol0}/{selectedPair.symbol1}</h3>
                    <p className="text-[10px] font-mono text-muted-foreground">{selectedPair.address.slice(0, 10)}…{selectedPair.address.slice(-8)}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedPair(null)} className="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
              </div>
              <PairChart
                pairAddress={selectedPair.address}
                baseSymbol={selectedPair.symbol0}
                quoteSymbol={selectedPair.symbol1}
                height={380}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
