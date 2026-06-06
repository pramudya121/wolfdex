/**
 * MarketView — public marketplace of every token launched on WolfDex
 * (curated TOKENS list + public launchpad registry). Includes search,
 * sort, and "All / New / Trending / Top / Voted / Watchlist" filters.
 */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { TOKENS, CHAIN_CONFIG, type TokenInfo } from '@/config/contracts';
import { useLaunchpadRegistry, registryToTokenInfo } from '@/hooks/useLaunchpadRegistry';
import { useMarketSocial } from '@/hooks/useMarketSocial';
import { useDexContext } from '@/context/DexContext';
import { WolfSkeleton } from './ui/WolfSkeleton';

const FALLBACK_LOGO = '/images/wdex-logo.png';

type Filter = 'all' | 'new' | 'trending' | 'top' | 'voted' | 'watchlist';
type SortKey = 'newest' | 'votes' | 'alpha';

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

export default function MarketView() {
  const { tokens: registry, loading } = useLaunchpadRegistry();
  const social = useMarketSocial();
  const { wallet } = useDexContext();

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [search, setSearch] = useState('');

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    // Curated/official tokens first
    for (const t of TOKENS) {
      if (t.isNative) continue;
      map.set(t.address.toLowerCase(), {
        token: t,
        createdAt: 0,
        creator: null,
        verified: true,
        source: 'curated',
      });
    }
    // Registry rows (community launches) — don't duplicate curated
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
        token: registryToTokenInfo(r),
        createdAt,
        creator: r.creator,
        verified: !!r.verified,
        source: 'launchpad',
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
      switch (filter) {
        case 'new':
          return r.source === 'launchpad' && r.createdAt &&
            Date.now() - r.createdAt < 14 * 86400000;
        case 'trending':
          return social.votesOf(r.token.address) >= 1;
        case 'top':
          return true; // sorted below
        case 'voted':
          return social.hasVoted(r.token.address);
        case 'watchlist':
          return social.isWatched(r.token.address);
        default:
          return true;
      }
    });

    const effSort: SortKey =
      filter === 'trending' || filter === 'top' || filter === 'voted' ? 'votes'
      : filter === 'new' ? 'newest'
      : sort;

    list = [...list].sort((a, b) => {
      if (effSort === 'votes') {
        const va = social.votesOf(a.token.address);
        const vb = social.votesOf(b.token.address);
        if (vb !== va) return vb - va;
      }
      if (effSort === 'alpha') return a.token.symbol.localeCompare(b.token.symbol);
      // newest
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      // verified/curated first as tiebreaker
      return (b.verified ? 1 : 0) - (a.verified ? 1 : 0);
    });

    if (filter === 'top') list = list.slice(0, 20);
    return list;
  }, [rows, filter, sort, search, social]);

  const counts = useMemo(() => ({
    all: rows.length,
    new: rows.filter(r => r.source === 'launchpad' && r.createdAt &&
      Date.now() - r.createdAt < 14 * 86400000).length,
    trending: rows.filter(r => social.votesOf(r.token.address) >= 1).length,
    top: Math.min(rows.length, 20),
    voted: social.votedCount,
    watchlist: social.watchCount,
  }), [rows, social]);

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
            <Link to="/swap" className="rounded-2xl border border-wolf-border/40 bg-wolf-surface/60 px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:border-wolf-pink/50">⇄ Swap</Link>
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
            <option value="votes">Sort: Most votes</option>
            <option value="alpha">Sort: A → Z</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6">
        {loading && rows.length === 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <WolfSkeleton key={i} className="h-56 rounded-2xl" />
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
          <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((r, i) => (
                <MarketCard
                  key={r.token.address}
                  row={r}
                  index={i}
                  social={social}
                  myAddr={wallet.address?.toLowerCase() || ''}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function MarketCard({
  row, index, social, myAddr,
}: {
  row: Row;
  index: number;
  social: ReturnType<typeof useMarketSocial>;
  myAddr: string;
}) {
  const { token, creator, verified, createdAt, source } = row;
  const votes = social.votesOf(token.address);
  const voted = social.hasVoted(token.address);
  const watched = social.isWatched(token.address);
  const mine = creator && myAddr && creator.toLowerCase() === myAddr;

  const copy = (s: string) => {
    navigator.clipboard.writeText(s).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
      className="group relative overflow-hidden rounded-2xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/80 via-background to-wolf-surface/40 p-5 transition-all hover:border-wolf-pink/50 hover:shadow-[0_0_30px_-8px_oklch(0.65_0.25_330_/_50%)]"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-wolf-pink/10 blur-2xl transition-opacity group-hover:opacity-100" />

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

      {/* meta */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
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
        <div className="col-span-2 rounded-xl border border-wolf-border/30 bg-background/40 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Creator</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-foreground">
            {creator ? short(creator) : source === 'curated' ? 'WolfDex Official' : '—'}
          </div>
        </div>
      </div>

      {/* vote row */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-wolf-border/30 bg-background/30 px-3 py-2">
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
      <div className="mt-4 grid grid-cols-4 gap-1.5">
        <Link
          to="/swap"
          search={{ from: undefined, to: token.address } as any}
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
