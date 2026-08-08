/**
 * MarketTokenCard — a single token tile on the Market page.
 * Shows identity, live price + change, sparkline, on-chain metrics and quick
 * actions (trade, liquidity, vote, watchlist, copy, explorer, details).
 */
import { Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import MiniDailyChart from './MiniDailyChart';
import { CHAIN_CONFIG } from '@/config/contracts';
import type { MarketToken } from '@/hooks/useMarketData';

export function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 })}K`;
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** USD formatter — keeps small token prices readable. */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return `$${fmt(n, 2)}`;
  if (n >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 8 })}`;
}

export function age(ts: number | null): string {
  if (!ts) return '—';
  const secs = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}


export default function MarketTokenCard({
  token,
  votes,
  voted,
  watched,
  onVote,
  onWatch,
}: {
  token: MarketToken;
  votes: number;
  voted: boolean;
  watched: boolean;
  onVote: () => void;
  onWatch: () => void;
}) {
  const up = token.change >= 0;
  const isNew = token.createdAt ? Date.now() - token.createdAt < 86_400_000 : false;

  const copy = () => {
    navigator.clipboard.writeText(token.address);
    toast.success(`${token.symbol} address copied`);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="wolf-card rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden group"
    >
      {/* hover sheen */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-wolf-pink/10 via-transparent to-wolf-gold/10" />

      <div className="flex items-start gap-3 relative">
        <img
          src={token.logo}
          alt={`${token.symbol} logo`}
          loading="lazy"
          className="w-11 h-11 rounded-xl object-cover ring-1 ring-wolf-border/50 bg-wolf-surface shrink-0"
          onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              to="/token/$address"
              params={{ address: token.address }}
              className="font-bold truncate hover:text-wolf-pink transition-colors"
            >
              {token.name}
            </Link>
            {token.verified && <span title="Verified token" className="text-wolf-gold text-xs">✓</span>}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono font-semibold text-foreground/80">{token.symbol}</span>
            {isNew && <span className="px-1.5 py-0.5 rounded bg-wolf-green/15 text-wolf-green font-semibold">NEW</span>}
            <span>{age(token.createdAt)}</span>
          </div>
        </div>
        <button
          onClick={onWatch}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          className={`text-lg leading-none transition-transform hover:scale-125 ${watched ? 'text-wolf-gold' : 'text-muted-foreground'}`}
        >
          {watched ? '★' : '☆'}
        </button>
      </div>

      <div className="flex items-end justify-between gap-2 relative">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</div>
          <div className="text-lg font-bold font-mono truncate">
            {token.priceUsd > 0 ? fmtUsd(token.priceUsd) : token.price > 0 ? fmt(token.price, 8) : '—'}
            {token.priceUsd > 0 && <span className="text-[10px] text-muted-foreground ml-1">USDC</span>}
            {token.priceUsd <= 0 && token.price > 0 && (
              <span className="text-[10px] text-muted-foreground ml-1">{CHAIN_CONFIG.symbol}</span>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground truncate">
            {token.price > 0 ? `${fmt(token.price, 8)} ${CHAIN_CONFIG.symbol}` : 'awaiting first pool'}
          </div>
          <div className={`text-[11px] font-semibold ${up ? 'text-wolf-green' : 'text-wolf-red'}`}>
            {token.history.length > 1 ? `${up ? '▲' : '▼'} ${Math.abs(token.change).toFixed(2)}%` : 'no trend yet'}
          </div>
        </div>
        <MiniDailyChart pair={token.pair} tokenAddress={token.address} fallback={token.history} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] relative">
        <Metric
          label="Liquidity"
          value={token.liquidity > 0 ? `${fmt(token.liquidity, 2)} ${CHAIN_CONFIG.symbol}` : 'No pool'}
          sub={token.liquidityUsd > 0 ? fmtUsd(token.liquidityUsd) : undefined}
        />
        <Metric label="Supply" value={fmt(token.totalSupply, 0)} />
        <Metric
          label="Mkt cap"
          value={token.price > 0 && token.totalSupply > 0 ? fmt(token.price * token.totalSupply, 2) : '—'}
          sub={token.priceUsd > 0 && token.totalSupply > 0 ? fmtUsd(token.priceUsd * token.totalSupply) : undefined}
        />
      </div>


      <div className="flex items-center gap-1.5 relative">
        <Link
          to="/swap"
          search={{ to: token.address }}
          className="flex-1 text-center text-xs font-bold py-2 rounded-xl bg-gradient-to-r from-wolf-pink to-wolf-gold text-white hover:opacity-90 transition-opacity"
        >
          Trade
        </Link>
        <Link
          to="/liquidity"
          search={{ token: token.address }}
          className="flex-1 text-center text-xs font-semibold py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors"
        >
          Liquidity
        </Link>
        <button
          onClick={onVote}
          title="Upvote"
          className={`text-xs font-semibold px-2.5 py-2 rounded-xl border transition-colors ${
            voted
              ? 'bg-wolf-pink/15 border-wolf-pink/50 text-wolf-pink'
              : 'bg-wolf-surface border-wolf-border/40 hover:bg-wolf-surface-hover'
          }`}
        >
          ▲ {votes}
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground relative">
        <button onClick={copy} className="font-mono hover:text-wolf-pink transition-colors">
          {token.address.slice(0, 6)}…{token.address.slice(-4)} 📋
        </button>
        <div className="flex items-center gap-2">
          <a
            href={`${CHAIN_CONFIG.blockExplorer}/address/${token.address}`}
            target="_blank" rel="noopener noreferrer"
            className="hover:text-wolf-gold transition-colors"
          >Explorer</a>
          <Link
            to="/token/$address"
            params={{ address: token.address }}
            className="hover:text-wolf-pink transition-colors"
          >Details →</Link>
        </div>
      </div>
    </motion.div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-wolf-surface/60 border border-wolf-border/30 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-semibold truncate">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground truncate">{sub}</div>}
    </div>

  );
}
