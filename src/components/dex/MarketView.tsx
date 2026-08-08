/**
 * MarketView — the WolfDex Market: every token launched on (or curated by)
 * WolfDex, with on-chain price/liquidity metrics, social signals, tabbed
 * filters, search, sorting and infinite scroll.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  const [tab, setTab] = useState<TabId>('all');
  const [sort, setSort] = useState<SortId>('default');
  const [query, setQuery] = useState('');
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
          <span className="w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse" />
          <span className="text-muted-foreground">Live on-chain data</span>
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
          <p className="font-semibold">No tokens match this view</p>
          <p className="text-xs mt-1">Try another tab, clear the search, or launch your own token.</p>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.slice(0, visible).map(t => (
              <MarketTokenCard
                key={t.address}
                token={t}
                votes={social.voteCount(t.address)}
                voted={social.hasVoted(t.address)}
                watched={social.isWatched(t.address)}
                onVote={() => social.vote(t.address)}
                onWatch={() => social.toggleWatch(t.address)}
              />
            ))}
          </div>
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

