import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CONTRACTS, getTokenByAddress, TOKENS } from '@/config/contracts';
import { useDexContext } from '@/context/DexContext';
import { useHistoricalAnalytics, type Bucket } from '@/hooks/useHistoricalAnalytics';
import PairChart from './PairChart';

interface PoolData {
  symbol0: string;
  symbol1: string;
  reserve0: string;
  reserve1: string;
  logo0: string;
  logo1: string;
  address: string;
  token0: string;
  token1: string;
}

const formatReserve = (value: string | number) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 }).format(amount)
    : '—';
};

export default function AnalyticsView() {
  const { getCachedPairsWithInfo, invalidatePairsCache } = useDexContext();
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [chartBucket, setChartBucket] = useState<Bucket>('day');
  const [selectedPair, setSelectedPair] = useState<PoolData | null>(null);
  const { series, stats, loading: historyLoading, error: historyError, latestBlock, refresh: refreshHistory } =
    useHistoricalAnalytics({ bucket: chartBucket, windowDays: 1 });

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setPairError(null);
    try {
      const cache = await getCachedPairsWithInfo(force);
      const nextPools: PoolData[] = [];
      for (const address of cache.pairs) {
        const info = cache.infos[address];
        if (!info) continue;
        const token0 = getTokenByAddress(info.token0);
        const token1 = getTokenByAddress(info.token1);
        nextPools.push({
          symbol0: token0?.symbol || info.token0.slice(0, 6),
          symbol1: token1?.symbol || info.token1.slice(0, 6),
          reserve0: info.reserve0,
          reserve1: info.reserve1,
          logo0: token0?.logo || '/images/wdex-logo.png',
          logo1: token1?.logo || '/images/wdex-logo.png',
          address,
          token0: info.token0,
          token1: info.token1,
        });
      }
      setPools(nextPools);
    } catch (cause) {
      setPairError(cause instanceof Error ? cause.message : 'Could not load on-chain pools.');
    } finally {
      setLoading(false);
    }
  }, [getCachedPairsWithInfo]);

  useEffect(() => {
    void load();
  }, [load]);

  const tokenReserves = useMemo(() => {
    const reserves = new Map<string, number>();
    const wrappedPrices = new Map<string, number>();
    const wrappedAddress = CONTRACTS.WETH.toLowerCase();
    for (const pool of pools) {
      const token0 = pool.token0.toLowerCase();
      const token1 = pool.token1.toLowerCase();
      const reserve0 = Number(pool.reserve0) || 0;
      const reserve1 = Number(pool.reserve1) || 0;
      reserves.set(token0, (reserves.get(token0) ?? 0) + reserve0);
      reserves.set(token1, (reserves.get(token1) ?? 0) + reserve1);
      if (token1 === wrappedAddress && reserve0 > 0) wrappedPrices.set(token0, reserve1 / reserve0);
      if (token0 === wrappedAddress && reserve1 > 0) wrappedPrices.set(token1, reserve0 / reserve1);
    }
    return TOKENS.filter(token => !token.isNative)
      .map(token => ({
        ...token,
        reserve: reserves.get(token.address.toLowerCase()) ?? 0,
        spotQuote: wrappedPrices.get(token.address.toLowerCase()) ?? null,
      }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [pools]);

  const statsCards = [
    { label: 'Pair contracts', value: pools.length.toLocaleString('en-US'), detail: 'Discovered from the factory' },
    { label: 'Recent swap events', value: stats.swaps24h.toLocaleString('en-US'), detail: 'Count from the current RPC block window' },
    { label: 'Latest indexed block', value: latestBlock ? latestBlock.toLocaleString('en-US') : '—', detail: 'LitVM testnet' },
    { label: 'Curated tokens', value: TOKENS.filter(token => !token.isNative).length.toLocaleString('en-US'), detail: 'Configured token list' },
  ];

  const refresh = () => {
    invalidatePairsCache();
    void load(true);
    void refreshHistory();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      <header className="text-center mb-8 relative">
        <div className="spotlight w-[520px] h-[280px] -top-10 left-1/2 -translate-x-1/2" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-pink/10 border border-wolf-pink/30 text-[10px] font-bold text-wolf-pink uppercase tracking-widest mb-3 relative">
          <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" /> LitVM testnet
        </div>
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-1 relative">Protocol Analytics</h1>
        <p className="text-muted-foreground text-sm relative">Factory pairs, indexed swap events, and on-chain reserve balances.</p>
      </header>

      <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
        <div className="flex gap-1 p-1 rounded-lg bg-wolf-surface border border-wolf-border/30" aria-label="Chart bucket size">
          {(['day', 'week'] as const).map(bucket => (
            <button key={bucket} type="button" onClick={() => setChartBucket(bucket)} aria-pressed={chartBucket === bucket}
              className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${chartBucket === bucket ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground hover:text-foreground'}`}>
              {bucket === 'day' ? 'Daily' : 'Weekly'}
            </button>
          ))}
        </div>
        <button type="button" onClick={refresh} disabled={historyLoading || loading}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all disabled:opacity-50">
          {historyLoading || loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </div>

      {(pairError || historyError || stats.incomplete) && (
        <div role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {pairError || historyError || 'Some RPC requests failed; swap activity may be incomplete.'}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statsCards.map((card, index) => (
          <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="analytics-stat rounded-xl p-4">
            <div className="text-xl font-black analytics-num">{loading && index === 0 ? '…' : card.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{card.label}</div>
            <div className="text-[10px] text-muted-foreground mt-2">{card.detail}</div>
          </motion.div>
        ))}
      </div>

      <section className="wolf-card rounded-xl p-4 mb-6" aria-labelledby="swap-events-title">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 id="swap-events-title" className="font-bold text-sm">Recent on-chain swap events</h2>
            <p className="text-xs text-muted-foreground mt-1">Activity indexed from recent LitVM blocks; no token values are combined into a synthetic dollar volume.</p>
          </div>
          {historyLoading && <span className="text-xs text-muted-foreground">Indexing…</span>}
        </div>
        {series.length === 0 && !historyLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No recent swap events were returned by the RPC.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#888' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#888' }} />
              <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="swaps" name="Swap events" fill="#e040a0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="wolf-card rounded-xl p-4" aria-labelledby="token-reserves-title">
          <h2 id="token-reserves-title" className="font-bold text-sm mb-4">Curated token reserves</h2>
          <div className="flex flex-col gap-2">
            {tokenReserves.map(token => (
              <div key={token.address} className="flex items-center justify-between gap-4 py-2 px-2 rounded-lg hover:bg-wolf-surface/50">
                <div className="flex items-center gap-3 min-w-0">
                  <img src={token.logo} alt="" className="w-6 h-6 rounded-full" onError={event => { (event.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  <div className="min-w-0">
                    <span className="font-medium text-sm">{token.symbol}</span>
                    <span className="text-[10px] text-muted-foreground ml-1">{token.name}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium text-sm">{formatReserve(token.reserve)} {token.symbol}</div>
                  <div className="text-[10px] text-muted-foreground">Spot quote: {token.spotQuote === null ? 'Unavailable' : `${token.spotQuote.toFixed(6)} zkLTC`}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="wolf-card rounded-xl p-4" aria-labelledby="discovered-pools-title">
          <h2 id="discovered-pools-title" className="font-bold text-sm mb-4">Discovered pools</h2>
          <div className="flex flex-col gap-2">
            {pools.slice(0, 8).map(pool => (
              <button key={pool.address} type="button" onClick={() => setSelectedPair(pool)} aria-label={`Open chart for ${pool.symbol0} and ${pool.symbol1}`}
                className="w-full flex items-center justify-between gap-3 py-2 px-2 rounded-lg hover:bg-wolf-surface/50 transition-all text-left group">
                <span className="font-medium text-sm group-hover:text-wolf-gold">{pool.symbol0}/{pool.symbol1}</span>
                <span className="text-right text-[10px] text-muted-foreground">
                  {formatReserve(pool.reserve0)} {pool.symbol0} · {formatReserve(pool.reserve1)} {pool.symbol1}
                </span>
              </button>
            ))}
            {pools.length === 0 && !loading && <p className="text-center text-muted-foreground text-sm py-4">No pools returned by the factory.</p>}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {selectedPair && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setSelectedPair(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} role="dialog" aria-modal="true" aria-label={`${selectedPair.symbol0}/${selectedPair.symbol1} price chart`} className="wolf-card rounded-2xl p-5 w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-lg">{selectedPair.symbol0}/{selectedPair.symbol1}</h2>
                  <p className="text-[10px] font-mono text-muted-foreground">{selectedPair.address.slice(0, 10)}…{selectedPair.address.slice(-8)}</p>
                </div>
                <button type="button" onClick={() => setSelectedPair(null)} aria-label="Close chart" className="text-muted-foreground hover:text-foreground text-2xl leading-none">&times;</button>
              </div>
              <PairChart pairAddress={selectedPair.address} baseSymbol={selectedPair.symbol0} quoteSymbol={selectedPair.symbol1} height={380} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
