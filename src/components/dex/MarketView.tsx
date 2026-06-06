/**
 * MarketView — public marketplace of every token launched on WolfDex
 * (curated TOKENS + public launchpad registry). Adds:
 *  - tabs: All / New Launches / Trending / Top / Voted / Watchlist
 *  - on-chain metrics: liquidity, TVL, 24h volume, swaps, price (vs wzkLTC)
 *  - per-card price sparkline + 24h % change
 *  - infinite scroll for fast rendering with many tokens
 *  - search + sort
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TOKENS, CHAIN_CONFIG, type TokenInfo } from '@/config/contracts';
import { useLaunchpadRegistry, registryToTokenInfo } from '@/hooks/useLaunchpadRegistry';
import { useMarketSocial } from '@/hooks/useMarketSocial';
import { useMarketMetrics, type TokenMetric } from '@/hooks/useMarketMetrics';
import { useDexContext } from '@/context/DexContext';
import { WolfSkeleton } from './ui/WolfSkeleton';
import { Sparkline } from './ui/Sparkline';

const FALLBACK_LOGO = '/images/wdex-logo.png';
const PAGE_SIZE = 12;

type Filter = 'all' | 'new' | 'trending' | 'top' | 'voted' | 'watchlist';
type SortKey = 'newest' | 'votes' | 'alpha' | 'tvl' | 'volume';

interface Row {
  token: TokenInfo;
  createdAt: number;        // ms, 0 if unknown
  creator: string | null;
  verified: boolean;
  source: 'curated' | 'launchpad';
}

function short(addr: string) { return `${addr.slice(0, 6)}…${addr.slice(-4)}`; }
function fmtDate(ms: number) {
  if (!ms) return '—';
  const d = new Date(ms);
  const diff = Date.now() - ms;
  const day = 86400000;
  if (diff < day) return 'today';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return d.toLocaleDateString();
}
function fmtNum(n: number): string {
  if (!isFinite(n) || n === 0) return '0';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  if (Math.abs(n) >= 1)   return n.toFixed(2);
  return n.toFixed(4);
}
function fmtPrice(n: number): string {
  if (!isFinite(n) || n === 0) return '—';
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(5);
  return n.toExponential(2);
}

export default function MarketView() {
  const { tokens: registry, loading: regLoading } = useLaunchpadRegistry();
  const social = useMarketSocial();
  const { wallet } = useDexContext();
  const { metrics, loading: metricsLoading, refresh: refreshMetrics, get: getMetric } = useMarketMetrics();

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination whenever filter/search/sort changes
  useEffect(() => { setVisible(PAGE_SIZE); }, [filter, search, sort]);

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const t of TOKENS) {
      if (t.isNative) continue;
      map.set(t.address.toLowerCase(), {
        token: t, createdAt: 0, creator: null, verified: true, source: 'curated',
      });
    }
    for (const r of registry) {
      const key = r.address.toLowerCase();
      const createdAt = (r as any).created_at ? new Date((r as any).created_at).getTime() : 0;
      const existing = map.get(key);
      if (existing) {
        existing.createdAt = createdAt || existing.createdAt;
        existing.creator = r.creator || existing.creator;
        existing.verified = existing.verified || !!r.verified;
        continue;
      }
      map.set(key, {
        token: registryToTokenInfo(r), createdAt, creator: r.creator,
        verified: !!r.verified, source: 'launchpad',
      });
    }
    return [...map.values()];
  }, [registry]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter(r => {
      if (q) {
        const hay = `${r.token.symbol} ${r.token.name} ${r.token.address}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const m = metrics[r.token.address.toLowerCase()];
      switch (filter) {
        case 'new':
          return r.source === 'launchpad' && r.createdAt &&
            Date.now() - r.createdAt < 14 * 86400000;
        case 'trending':
          // hybrid: on-chain swap activity OR community votes
          return (m?.swaps ?? 0) >= 1 || social.votesOf(r.token.address) >= 1;
        case 'top':
          return true;
        case 'voted':
          return social.hasVoted(r.token.address);
        case 'watchlist':
          return social.isWatched(r.token.address);
        default:
          return true;
      }
    });

    const effSort: SortKey =
      filter === 'trending' ? 'volume'
      : filter === 'top'    ? 'tvl'
      : filter === 'voted'  ? 'votes'
      : filter === 'new'    ? 'newest'
      : sort;

    list = [...list].sort((a, b) => {
      const ma = metrics[a.token.address.toLowerCase()];
      const mb = metrics[b.token.address.toLowerCase()];
      if (effSort === 'votes') {
        const va = social.votesOf(a.token.address);
        const vb = social.votesOf(b.token.address);
        if (vb !== va) return vb - va;
      }
      if (effSort === 'volume') {
        const va = (ma?.volume24h ?? 0) + social.votesOf(a.token.address);
        const vb = (mb?.volume24h ?? 0) + social.votesOf(b.token.address);
        if (vb !== va) return vb - va;
      }
      if (effSort === 'tvl') {
        const va = ma?.tvlProxy ?? 0;
        const vb = mb?.tvlProxy ?? 0;
        if (vb !== va) return vb - va;
      }
      if (effSort === 'alpha') return a.token.symbol.localeCompare(b.token.symbol);
      // default: newest
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
    });

    if (filter === 'top') list = list.slice(0, 20);
    return list;
  }, [rows, filter, sort, search, social, metrics]);

  const counts = useMemo(() => ({
    all: rows.length,
    new: rows.filter(r => r.source === 'launchpad' && r.createdAt &&
      Date.now() - r.createdAt < 14 * 86400000).length,
    trending: rows.filter(r => {
      const m = metrics[r.token.address.toLowerCase()];
      return (m?.swaps ?? 0) >= 1 || social.votesOf(r.token.address) >= 1;
    }).length,
    top: Math.min(rows.length, 20),
    voted: social.votedCount,
    watchlist: social.watchCount,
  }), [rows, social, metrics]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setVisible(v => Math.min(filtered.length, v + PAGE_SIZE));
        }
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtered.length]);

  const pageRows = filtered.slice(0, visible);

  const TABS: { key: Filter; label: string; icon: string }[] = [
    { key: 'all',       label: 'All',           icon: '🌐' },
    { key: 'new',       label: 'New Launches',  icon: '🚀' },
    { key: 'trending',  label: 'Trending',      icon: '🔥' },
    { key: 'top',       label: 'Top',           icon: '🏆' },
    { key: 'voted',     label: 'Voted',         icon: '👍' },
    { key: 'watchlist', label: 'Watchlist',     icon: '⭐' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-24 pb-16">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-red/15 via-wolf-pink/10 to-wolf-gold/10 px-6 py-8 sm:px-10 sm:py-12"
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-wolf-pink/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-wolf-gold/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-wolf-border/40 bg-background/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-wolf-pink">
              <span className="h-1.5 w-1.5 rounded-full bg-wolf-pink animate-pulse" /> WolfDex Market
            </div>
            <h1 className="text-3xl font-black leading-tight wolf-gradient-text sm:text-5xl">
              Discover every token on WolfDex
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Browse curated assets and freshly launched community tokens on
              LitVM LiteForge. Vote, watchlist, swap, and add liquidity — all
              from one place.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/launchpad" className="wolf-btn-primary rounded-2xl px-4 py-2.5 text-sm font-bold">🚀 Launch Token</Link>
            <button
              onClick={() => refreshMetrics()}
              className="rounded-2xl border border-wolf-border/40 bg-wolf-surface/60 px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-wolf-pink/50 disabled:opacity-60"
              disabled={metricsLoading}
              title="Refresh on-chain metrics"
            >
              {metricsLoading ? '⏳ Indexing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Listed Tokens', value: counts.all },
            { label: 'New (14d)', value: counts.new },
            { label: 'Trending', value: counts.trending },
            { label: 'In Watchlist', value: counts.watchlist },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border border-wolf-border/30 bg-background/40 px-4 py-3 backdrop-blur">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-xl font-black text-foreground">{s.value}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Filter bar */}
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {TABS.map(t => {
            const active = filter === t.key;
            const c = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`relative rounded-full px-4 py-2 text-xs font-semibold transition-all wolf-focus-ring ${
                  active
                    ? 'border border-wolf-red/40 bg-gradient-to-br from-wolf-red/25 via-wolf-pink/20 to-wolf-gold/10 text-foreground shadow-[0_0_20px_-6px_oklch(0.65_0.25_330_/_60%)]'
                    : 'border border-wolf-border/40 bg-wolf-surface/50 text-muted-foreground hover:text-foreground hover:border-wolf-pink/40'
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>{t.label}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-background/40 text-wolf-pink' : 'bg-background/60 text-muted-foreground'}`}>{c}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, symbol, address…"
              className="h-10 w-64 rounded-xl border border-wolf-border/40 bg-wolf-surface/40 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-wolf-pink/50"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="h-10 rounded-xl border border-wolf-border/40 bg-wolf-surface/40 px-3 text-sm text-foreground outline-none focus:border-wolf-pink/50"
          >
            <option value="newest">Sort: Newest</option>
            <option value="tvl">Sort: TVL</option>
            <option value="volume">Sort: 24h Volume</option>
            <option value="votes">Sort: Most votes</option>
            <option value="alpha">Sort: A → Z</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6">
        {regLoading && rows.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <WolfSkeleton key={i} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-wolf-border/40 bg-wolf-surface/30 p-12 text-center">
            <div className="mb-2 text-4xl">🪐</div>
            <h3 className="text-lg font-bold text-foreground">No tokens here yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {filter === 'watchlist'
                ? 'Tap the star on any card to add it to your watchlist.'
                : filter === 'voted'
                ? 'Vote on tokens you like — they will show up here.'
                : 'Try a different filter or search.'}
            </p>
          </div>
        ) : (
          <>
            <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {pageRows.map((r, i) => (
                  <MarketCard
                    key={r.token.address}
                    row={r}
                    index={i}
                    social={social}
                    metric={getMetric(r.token.address)}
                    myAddr={wallet.address?.toLowerCase() || ''}
                  />
                ))}
              </AnimatePresence>
            </motion.div>

            {/* Infinite-scroll sentinel + status */}
            <div ref={sentinelRef} className="h-12" />
            <div className="mt-2 text-center text-xs text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{pageRows.length}</span> of {filtered.length}
              {visible < filtered.length && ' — scroll for more'}
              {metricsLoading && ' · indexing on-chain metrics…'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MarketCard({
  row, index, social, metric, myAddr,
}: {
  row: Row;
  index: number;
  social: ReturnType<typeof useMarketSocial>;
  metric: TokenMetric;
  myAddr: string;
}) {
  const { token, creator, verified, createdAt, source } = row;
  const votes = social.votesOf(token.address);
  const voted = social.hasVoted(token.address);
  const watched = social.isWatched(token.address);
  const mine = creator && myAddr && creator.toLowerCase() === myAddr;

  const copy = useCallback((s: string) => {
    navigator.clipboard.writeText(s).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    );
  }, []);

  const hasSeries = metric.prices.length >= 2;
  const up = hasSeries ? metric.prices[metric.prices.length - 1] >= metric.prices[0] : true;
  const changeAbs = Math.abs(metric.change);
  const changeLabel = hasSeries ? `${up ? '▲' : '▼'} ${changeAbs.toFixed(2)}%` : '— %';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
      className="group relative overflow-hidden rounded-2xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/80 via-background to-wolf-surface/40 p-5 transition-all hover:border-wolf-pink/50 hover:shadow-[0_0_30px_-8px_oklch(0.65_0.25_330_/_50%)]"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-wolf-pink/10 blur-2xl" />

      {/* header */}
      <div className="flex items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-wolf-border/40 bg-background/60">
          <img
            src={token.logo || FALLBACK_LOGO}
            alt={`${token.symbol} logo`}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_LOGO; }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-foreground">{token.symbol}</h3>
            {verified && (
              <span title="Verified / curated" className="rounded-full bg-wolf-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-wolf-cyan">✓</span>
            )}
            {source === 'launchpad' && (
              <span className="rounded-full border border-wolf-pink/30 px-1.5 py-0.5 text-[10px] font-semibold text-wolf-pink">Launchpad</span>
            )}
            {mine && (
              <span className="rounded-full bg-wolf-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-wolf-gold">You</span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{token.name}</p>
        </div>
        <button
          onClick={() => social.toggleWatch(token.address)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
            watched
              ? 'border-wolf-gold/50 bg-wolf-gold/15 text-wolf-gold'
              : 'border-wolf-border/40 bg-background/40 text-muted-foreground hover:text-wolf-gold hover:border-wolf-gold/40'
          }`}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      {/* Price + Sparkline */}
      <div className="mt-4 flex items-end justify-between gap-3 rounded-xl border border-wolf-border/30 bg-background/40 px-3 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price (wzkLTC)</div>
          <div className="mt-0.5 truncate font-mono text-base font-bold text-foreground">
            {fmtPrice(metric.priceWNative)}
          </div>
          <div className={`mt-0.5 text-[11px] font-semibold ${up ? 'text-wolf-green' : 'text-wolf-red'}`}>
            {changeLabel} <span className="text-muted-foreground">· 6h</span>
          </div>
        </div>
        <div className="shrink-0">
          <Sparkline values={metric.prices} width={120} height={40} />
        </div>
      </div>

      {/* On-chain metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Metric label="TVL" value={fmtNum(metric.tvlProxy)} />
        <Metric label="24h Vol" value={fmtNum(metric.volume24h)} />
        <Metric label="Swaps" value={String(metric.swaps)} />
      </div>

      {/* meta */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-wolf-border/30 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Address</div>
          <button
            onClick={() => copy(token.address)}
            className="mt-0.5 truncate font-mono text-[11px] text-foreground hover:text-wolf-pink"
            title="Copy address"
          >
            {short(token.address)}
          </button>
        </div>
        <div className="rounded-xl border border-wolf-border/30 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Launched</div>
          <div className="mt-0.5 truncate text-[11px] text-foreground">{fmtDate(createdAt)}</div>
        </div>
      </div>

      {/* vote row */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-wolf-border/30 bg-background/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>🔥</span>
          <span><span className="font-bold text-foreground">{votes}</span> {votes === 1 ? 'vote' : 'votes'}</span>
        </div>
        <button
          onClick={() => social.vote(token.address)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${
            voted
              ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40'
              : 'bg-wolf-surface/60 text-foreground border border-wolf-border/40 hover:border-wolf-pink/40'
          }`}
        >
          {voted ? '✓ Voted' : '▲ Vote'}
        </button>
      </div>

      {/* actions */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Link
          to="/swap"
          className="rounded-xl bg-gradient-to-br from-wolf-red to-wolf-pink px-2 py-2 text-center text-[11px] font-bold text-white transition-transform hover:scale-[1.02]"
        >
          Swap
        </Link>
        <Link
          to="/liquidity"
          className="rounded-xl border border-wolf-border/40 bg-wolf-surface/60 px-2 py-2 text-center text-[11px] font-semibold text-foreground transition-colors hover:border-wolf-pink/40"
        >
          Liquidity
        </Link>
        <Link
          to="/token/$address"
          params={{ address: token.address }}
          className="rounded-xl border border-wolf-border/40 bg-wolf-surface/60 px-2 py-2 text-center text-[11px] font-semibold text-foreground transition-colors hover:border-wolf-pink/40"
        >
          Details
        </Link>
        <a
          href={`${CHAIN_CONFIG.blockExplorer}/address/${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-wolf-border/40 bg-wolf-surface/60 px-2 py-2 text-center text-[11px] font-semibold text-foreground transition-colors hover:border-wolf-pink/40"
        >
          Explorer ↗
        </a>
      </div>
    </motion.article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-wolf-border/30 bg-background/40 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-bold text-foreground">{value}</div>
    </div>
  );
}
