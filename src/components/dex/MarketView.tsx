/**
 * MarketView — the WolfDex Market: every token launched on (or curated by)
 * WolfDex, with on-chain price/liquidity metrics, social signals, tabbed
 * filters, search, sorting and infinite scroll.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useLiveBlock } from '@/lib/liveBlocks';
import RouteErrorBoundary from './RouteErrorBoundary';
import Sparkline from './market/Sparkline';
import { useMarketData } from '@/hooks/useMarketData';
import { useMarketSocial } from '@/hooks/useMarketSocial';
import MarketTokenCard, { fmt, fmtUsd } from './market/MarketTokenCard';
import { CHAIN_CONFIG } from '@/config/contracts';
import { WolfSkeleton } from './ui/WolfSkeleton';

const TABS = [
  { id: 'all', label: 'All', icon: '🌐' },
  { id: 'new', label: 'New Launches', icon: '✨' },
  { id: 'trending', label: 'Trending', icon: '🔥' },
  { id: 'top', label: 'Top', icon: '🏆' },
  { id: 'gainers', label: 'Top Gainers', icon: '📈' },
  { id: 'voted', label: 'Voted', icon: '▲' },
  { id: 'watchlist', label: 'Watchlist', icon: '★' },
] as const;
type TabId = typeof TABS[number]['id'];

const SORTS = [
  { id: 'default', label: 'Recommended' },
  { id: 'newest', label: 'Newest' },
  { id: 'liquidity', label: 'Liquidity' },
  { id: 'change', label: 'Price change' },
  { id: 'votes', label: 'Most voted' },
  { id: 'name', label: 'A–Z' },
] as const;
type SortId = typeof SORTS[number]['id'];

const PAGE = 12;

export default function MarketView() {
  const { tokens, loading, lastUpdated, nativeUsd, refresh } = useMarketData();
  const social = useMarketSocial();
  const search = useSearch({ strict: false }) as { tab?: TabId; sort?: SortId; q?: string; view?: 'grid' | 'table' };
  const navigate = useNavigate();
  const tab: TabId = TABS.some(t => t.id === search.tab) ? search.tab! : 'all';
  const sort: SortId = SORTS.some(s => s.id === search.sort) ? search.sort! : 'default';
  const query = search.q ?? '';
  const view = search.view === 'table' ? 'table' : 'grid';
  const setParam = (patch: Record<string, string | undefined>) =>
    navigate({ to: '/market', search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) as never, replace: true });
  const setTab = (v: TabId) => setParam({ tab: v === 'all' ? undefined : v });
  const setSort = (v: SortId) => setParam({ sort: v === 'default' ? undefined : v });
  const setQuery = (v: string) => setParam({ q: v || undefined });
  const live = useLiveBlock();
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tokens.filter(t => {
      if (verifiedOnly && !t.verified) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    });

    if (tab === 'new') {
      list = list
        .filter(t => t.createdAt !== null)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    } else if (tab === 'trending') {
      // activity proxy: liquidity weighted by absolute recent price movement
      list = [...list].sort((a, b) =>
        (Math.abs(b.change) * Math.log10(1 + b.liquidity)) -
        (Math.abs(a.change) * Math.log10(1 + a.liquidity)),
      );
    } else if (tab === 'top') {
      list = [...list].sort((a, b) => b.liquidity - a.liquidity);
    } else if (tab === 'gainers') {
      list = list.filter(t => t.history.length > 1 && t.change > 0).sort((a, b) => b.change - a.change);
    } else if (tab === 'voted') {
      list = list
        .filter(t => social.voteCount(t.address) > 0)
        .sort((a, b) => social.voteCount(b.address) - social.voteCount(a.address));
    } else if (tab === 'watchlist') {
      list = list.filter(t => social.isWatched(t.address));
    }

    if (sort !== 'default') {
      list = [...list].sort((a, b) => {
        switch (sort) {
          case 'newest': return (b.createdAt ?? 0) - (a.createdAt ?? 0);
          case 'liquidity': return b.liquidity - a.liquidity;
          case 'change': return b.change - a.change;
          case 'votes': return social.voteCount(b.address) - social.voteCount(a.address);
          case 'name': return a.symbol.localeCompare(b.symbol);
          default: return 0;
        }
      });
    } else if (tab === 'all') {
      // curated + verified first, then the deepest pools
      list = [...list].sort((a, b) =>
        Number(b.curated) - Number(a.curated) ||
        Number(b.verified) - Number(a.verified) ||
        b.liquidity - a.liquidity,
      );
    }

    return list;
  }, [tokens, tab, sort, query, verifiedOnly, social]);

  useEffect(() => { setVisible(PAGE); }, [tab, sort, query, verifiedOnly]);

  // Infinite scroll
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisible(v => (v < filtered.length ? v + PAGE : v));
      }
    }, { rootMargin: '300px' });
    io.observe(node);
    return () => io.disconnect();
  }, [filtered.length]);

  const stats = useMemo(() => {
    const totalLiq = tokens.reduce((s, t) => s + t.liquidity, 0);
    const withPool = tokens.filter(t => t.liquidity > 0).length;
    const newToday = tokens.filter(t => t.createdAt && Date.now() - t.createdAt < 86_400_000).length;
    return { totalLiq, withPool, newToday, count: tokens.length };
  }, [tokens]);

  return (
    <div className="max-w-7xl mx-auto px-4 pt-6 pb-24">
      {/* Hero */}
      <div className="relative mb-8 text-center">
        <div className="absolute inset-x-0 -top-8 h-56 -z-10 pointer-events-none">
          <div className="absolute left-1/4 top-0 w-72 h-72 rounded-full bg-wolf-pink/10 blur-3xl" />
          <div className="absolute right-1/4 top-6 w-72 h-72 rounded-full bg-wolf-gold/10 blur-3xl" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-surface/60 border border-wolf-border/30 text-[11px] mb-3">
          <span className={`w-1.5 h-1.5 rounded-full ${live.stale ? 'bg-wolf-red' : 'bg-wolf-green animate-pulse'}`} />
          <span className="text-muted-foreground">{live.stale ? 'Stale — reconnecting' : 'Live on-chain data'}</span>
          {live.block > 0 && (<><span className="text-wolf-border">·</span><span className="text-muted-foreground font-mono">#{live.block.toLocaleString('en-US')}</span></>)}
          {nativeUsd > 0 && (
            <>
              <span className="text-wolf-border">·</span>
              <span className="text-muted-foreground">
                1 {CHAIN_CONFIG.symbol} ≈ {fmtUsd(nativeUsd)}
              </span>
            </>
          )}
          {lastUpdated && (
            <>
              <span className="text-wolf-border">·</span>
              <span className="text-muted-foreground">
                updated {new Date(lastUpdated).toLocaleTimeString('en-US')}
              </span>
            </>
          )}
        </div>

        <h1 className="text-4xl sm:text-5xl font-black wolf-gradient-text tracking-tight mb-2">WolfDex Market</h1>
        <p className="text-muted-foreground text-sm max-w-xl mx-auto">
          Every token launched on WolfDex, priced straight from the AMM pools. Track new launches,
          trending movers and the deepest liquidity — then trade in one click.
        </p>
        <Link
          to="/launchpad"
          className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-wolf-pink to-wolf-gold shadow-lg hover:scale-[1.03] active:scale-95 transition-transform"
        >
          🚀 Create Token
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Listed tokens" value={stats.count.toLocaleString('en-US')} />
        <Stat label="With live pool" value={stats.withPool.toLocaleString('en-US')} />
        <Stat label="New (24h)" value={stats.newToday.toLocaleString('en-US')} />
        <Stat
          label="Total liquidity"
          value={`${fmt(stats.totalLiq, 2)} ${CHAIN_CONFIG.symbol}`}
          sub={nativeUsd > 0 ? fmtUsd(stats.totalLiq * nativeUsd) : undefined}
        />

      </div>

      {/* Controls */}
      <div className="wolf-card rounded-2xl p-3 mb-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === t.id ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="market-tab-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-wolf-pink to-wolf-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{t.icon} {t.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, symbol or address…"
              className="w-full bg-wolf-surface border border-wolf-border/40 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-wolf-pink/60 transition-colors"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortId)}
            className="bg-wolf-surface border border-wolf-border/40 rounded-xl px-3 py-2 text-sm outline-none focus:border-wolf-pink/60"
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>Sort: {s.label}</option>)}
          </select>
          <button
            onClick={() => setVerifiedOnly(v => !v)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              verifiedOnly
                ? 'bg-wolf-gold/15 border-wolf-gold/50 text-wolf-gold'
                : 'bg-wolf-surface border-wolf-border/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            ✓ Verified only
          </button>
          <div className="flex rounded-xl border border-wolf-border/40 overflow-hidden text-xs font-semibold">
            {(['grid', 'table'] as const).map(v => (
              <button key={v} onClick={() => setParam({ view: v === 'grid' ? undefined : v })}
                aria-pressed={view === v}
                className={`px-3 py-2 transition-colors ${view === v ? 'bg-wolf-pink/20 text-wolf-pink' : 'bg-wolf-surface text-muted-foreground hover:text-foreground'}`}>
                {v === 'grid' ? '▦ Cards' : '☰ Table'}
              </button>
            ))}
          </div>
          <button
            onClick={() => refresh()}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-wolf-surface border border-wolf-border/40 hover:bg-wolf-surface-hover transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading && tokens.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="wolf-card rounded-2xl p-4 space-y-3">
              <WolfSkeleton className="h-11 w-11 rounded-xl" />
              <WolfSkeleton className="h-4 w-2/3" />
              <WolfSkeleton className="h-8 w-full" />
              <WolfSkeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <div className="text-4xl mb-3">🐺</div>
          <p className="font-semibold">{tab === 'watchlist' ? 'Your watchlist is empty' : query ? `No results for “${query}”` : 'No tokens match this view'}</p>
          <p className="text-xs mt-1">{tab === 'watchlist' ? 'Tap ☆ on any token to follow it here.' : 'Try another tab, clear the search, or launch your own token.'}</p>
          {(query || tab !== 'all') && (
            <button onClick={() => setParam({ q: undefined, tab: undefined })} className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-wolf-surface border border-wolf-border/40 hover:bg-wolf-surface-hover">Reset filters</button>
          )}
        </div>
      ) : (
        <>
          {view === 'table' ? (
            <MarketTable tokens={filtered.slice(0, visible)} social={social} />
          ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.slice(0, visible).map(t => (
              <RouteErrorBoundary key={t.address}>
              <MarketTokenCard
                key={t.address}
                token={t}
                votes={social.voteCount(t.address)}
                voted={social.hasVoted(t.address)}
                watched={social.isWatched(t.address)}
                onVote={() => social.vote(t.address)}
                onWatch={() => social.toggleWatch(t.address)}
              />
              </RouteErrorBoundary>
            ))}
          </div>
          )}
          <div ref={sentinel} className="h-10" />
          <div className="text-center text-[11px] text-muted-foreground">
            Showing {Math.min(visible, filtered.length)} of {filtered.length} tokens
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="wolf-card rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-lg font-bold truncate">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}


type Social = ReturnType<typeof useMarketSocial>;

function MarketTable({ tokens, social }: { tokens: ReturnType<typeof useMarketData>['tokens']; social: Social }) {
  return (
    <div className="wolf-card rounded-2xl overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-wolf-border/30">
          <tr>
            <th className="text-left p-3 w-8"></th>
            <th className="text-left p-3">Token</th>
            <th className="text-right p-3">Price</th>
            <th className="text-right p-3">Change</th>
            <th className="text-right p-3">Liquidity</th>
            <th className="text-right p-3">Trend</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {tokens.map(t => {
            const hasTrend = t.history.length > 1;
            const up = t.change >= 0;
            return (
              <tr key={t.address} className="border-b border-wolf-border/20 last:border-0 hover:bg-wolf-surface/50 transition-colors">
                <td className="p-3">
                  <button onClick={() => social.toggleWatch(t.address)} aria-label="Toggle watchlist"
                    className={social.isWatched(t.address) ? 'text-wolf-gold' : 'text-muted-foreground'}>
                    {social.isWatched(t.address) ? '★' : '☆'}
                  </button>
                </td>
                <td className="p-3">
                  <Link to="/token/$address" params={{ address: t.address }} className="flex items-center gap-2.5 hover:text-wolf-pink">
                    <img src={t.logo} alt="" loading="lazy" className="w-8 h-8 rounded-lg object-cover bg-wolf-surface"
                      onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate max-w-[180px]">{t.name} {t.verified && <span className="text-wolf-gold text-xs">✓</span>}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{t.symbol}</div>
                    </div>
                  </Link>
                </td>
                <td className="p-3 text-right font-mono">
                  {t.priceUsd > 0 ? fmtUsd(t.priceUsd) : t.price > 0 ? `${fmt(t.price, 8)} ${CHAIN_CONFIG.symbol}` : '—'}
                </td>
                <td className={`p-3 text-right font-semibold ${!hasTrend ? 'text-muted-foreground' : up ? 'text-wolf-green' : 'text-wolf-red'}`}>
                  {hasTrend ? `${up ? '▲' : '▼'} ${Math.abs(t.change).toFixed(2)}%` : '—'}
                </td>
                <td className="p-3 text-right">
                  {t.liquidityUsd > 0 ? fmtUsd(t.liquidityUsd) : t.liquidity > 0 ? `${fmt(t.liquidity, 2)} ${CHAIN_CONFIG.symbol}` : <span className="text-muted-foreground">No pool</span>}
                </td>
                <td className="p-3">
                  <div className="flex justify-end">
                    {hasTrend ? <Sparkline data={t.history} positive={up} width={88} height={28} /> : <span className="text-muted-foreground text-xs">—</span>}
                  </div>
                </td>
                <td className="p-3 text-right">
                  <Link to="/swap" search={{ to: t.address }}
                    className="inline-block text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-wolf-pink to-wolf-gold text-white hover:opacity-90">
                    Swap
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
