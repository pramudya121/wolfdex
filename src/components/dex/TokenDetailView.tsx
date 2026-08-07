/**
 * TokenDetailView — full trading page for a single token:
 * identity + on-chain stats, daily price chart from AMM swap events,
 * an embedded swap widget pre-loaded with this token, and social actions.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CHAIN_CONFIG, CONTRACTS, getTokenByAddress, type TokenInfo, NATIVE_TOKEN } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';
import { getRegistryToken } from '@/hooks/useLaunchpadRegistry';
import { useMarketToken } from '@/hooks/useMarketData';
import { useMarketSocial } from '@/hooks/useMarketSocial';
import { usePairStats } from '@/hooks/usePairStats';
import { useTokenHolders } from '@/hooks/useTokenHolders';
import { useDexContext } from '@/context/DexContext';

import { fmt, age } from './market/MarketTokenCard';
import Sparkline from './market/Sparkline';
import PairChart from './PairChart';
import RecentTrades from './market/RecentTrades';
import TokenPools from './market/TokenPools';
import SwapCard from './SwapCard';

interface OnChain {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  balance: string | null;
}

export default function TokenDetailView({ address: rawAddress }: { address: string }) {
  let address = rawAddress;
  try { address = ethers.utils.getAddress(rawAddress); } catch { /* keep raw */ }

  const { wallet, dex, txHistory } = useDexContext();
  const { token: market, loading: marketLoading, refresh } = useMarketToken(address);
  const social = useMarketSocial();
  const stats = usePairStats(market?.pair ?? null);
  const { holders, loading: holdersLoading } = useTokenHolders(address);

  const [chain, setChain] = useState<OnChain | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registry = getRegistryToken(address);
  const curated = getTokenByAddress(address);

  // On-chain metadata is the source of truth; registry only fills gaps.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const provider = getReadProvider();
        const c = new ethers.Contract(address, ERC20_ABI, provider);
        const FAIL = Symbol('fail');
        const safe = <T,>(p: Promise<T>) => p.catch(() => FAIL as unknown as T);
        const [n, s, d, ts, bal] = await Promise.all([
          safe(c.name()),
          safe(c.symbol()),
          safe(c.decimals()),
          safe(c.totalSupply()),
          wallet.address ? safe(c.balanceOf(wallet.address)) : Promise.resolve(ethers.constants.Zero),
        ]);
        if (cancelled) return;
        const decimals = d !== (FAIL as unknown) ? Number(d) : (curated?.decimals ?? registry?.decimals ?? 18);
        setChain({
          name: n !== (FAIL as unknown) ? String(n) : (curated?.name ?? registry?.name ?? 'Unknown Token'),
          symbol: s !== (FAIL as unknown) ? String(s) : (curated?.symbol ?? registry?.symbol ?? '?'),
          decimals,
          totalSupply: ethers.utils.formatUnits(
            ts !== (FAIL as unknown) ? (ts as ethers.BigNumber) : ethers.constants.Zero, decimals),
          balance: wallet.address
            ? ethers.utils.formatUnits(bal !== (FAIL as unknown) ? (bal as ethers.BigNumber) : ethers.constants.Zero, decimals)
            : null,
        });
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || 'Failed to load token');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, wallet.address]);

  const logo = curated?.logo || registry?.logo_url || market?.logo || '/images/wdex-logo.png';
  const name = chain?.name ?? market?.name ?? 'Loading…';
  const symbol = chain?.symbol ?? market?.symbol ?? '…';
  const decimals = chain?.decimals ?? market?.decimals ?? 18;
  const verified = curated ? true : !!registry?.verified;
  const up = (market?.change ?? 0) >= 0;

  const tokenInfo: TokenInfo = useMemo(() => ({
    address,
    symbol,
    name,
    decimals,
    logo,
  }), [address, symbol, name, decimals, logo]);

  // Record swaps made from this page into the global history.
  const swap: typeof dex.swap = async (from, to, amountIn, amountOut, slippagePct, deadlineMinutes, routePath) => {
    const hash = await dex.swap(from, to, amountIn, amountOut, slippagePct, deadlineMinutes, routePath);
    if (hash && wallet.address) {
      txHistory.add({
        hash,
        kind: 'swap',
        summary: `${parseFloat(amountIn).toFixed(4)} ${from.symbol} → ${parseFloat(amountOut).toFixed(4)} ${to.symbol}`,
        account: wallet.address,
        status: 'success',
        chainId: wallet.chainId,
      });
    }
    return hash!;
  };

  const copy = () => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-24">
      <div className="mb-4 flex items-center gap-3 text-xs">
        <Link to="/market" className="text-muted-foreground hover:text-wolf-pink transition-colors">← Market</Link>
        <span className="text-wolf-border">·</span>
        <Link to="/launchpad" className="text-muted-foreground hover:text-wolf-pink transition-colors">Launchpad</Link>
      </div>

      {error && <div className="text-center text-wolf-red py-6">{error}</div>}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="wolf-card rounded-3xl p-5 sm:p-7 mb-5 relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-wolf-pink/10 blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 relative">
          <motion.img
            src={logo}
            alt={`${symbol} logo`}
            whileHover={{ rotateY: 18, scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            className="w-20 h-20 rounded-2xl object-cover ring-2 ring-wolf-pink/40 bg-wolf-surface shrink-0"
            style={{ transformStyle: 'preserve-3d' }}
            onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-black wolf-gradient-text truncate">{name}</h1>
              {verified && <span className="text-[10px] px-2 py-0.5 rounded-full bg-wolf-gold/15 text-wolf-gold font-bold">VERIFIED</span>}
              {curated && <span className="text-[10px] px-2 py-0.5 rounded-full bg-wolf-pink/15 text-wolf-pink font-bold">OFFICIAL</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
              <span className="font-mono font-bold text-foreground">{symbol}</span>
              <span>·</span>
              <span>{decimals} decimals</span>
              <span>·</span>
              <span>listed {age(market?.createdAt ?? null)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 font-mono transition-colors">
                {address.slice(0, 10)}…{address.slice(-6)} 📋
              </button>
              <a
                href={`${CHAIN_CONFIG.blockExplorer}/address/${address}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors"
              >🔗 Explorer</a>
              <button
                onClick={() => social.vote(address)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  social.hasVoted(address)
                    ? 'bg-wolf-pink/15 border-wolf-pink/50 text-wolf-pink'
                    : 'bg-wolf-surface border-wolf-border/40 hover:bg-wolf-surface-hover'
                }`}
              >▲ Upvote {social.voteCount(address)}</button>
              <button
                onClick={() => social.toggleWatch(address)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  social.isWatched(address)
                    ? 'bg-wolf-gold/15 border-wolf-gold/50 text-wolf-gold'
                    : 'bg-wolf-surface border-wolf-border/40 hover:bg-wolf-surface-hover'
                }`}
              >{social.isWatched(address) ? '★ Watching' : '☆ Watchlist'}</button>
              <button
                onClick={() => refresh()}
                className="text-xs px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors"
              >🔄 Refresh</button>
            </div>
          </div>

          {/* Price block */}
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Price</div>
            <div className="text-2xl font-black font-mono">
              {market && market.price > 0 ? fmt(market.price, 8) : '—'}
              <span className="text-[11px] text-muted-foreground ml-1">{CHAIN_CONFIG.symbol}</span>
            </div>
            <div className={`text-xs font-semibold ${up ? 'text-wolf-green' : 'text-wolf-red'}`}>
              {market && market.history.length > 1
                ? `${up ? '▲' : '▼'} ${Math.abs(market.change).toFixed(2)}%`
                : 'no trend yet'}
            </div>
            <Sparkline data={market?.history ?? []} positive={up} width={120} height={36} className="text-muted-foreground ml-auto" />
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Stat label="Liquidity" value={market && market.liquidity > 0 ? `${fmt(market.liquidity, 2)} ${CHAIN_CONFIG.symbol}` : 'No pool yet'} />
        <Stat
          label={`24h volume`}
          value={stats.volume > 0 ? `${fmt(stats.volume, 3)} ${CHAIN_CONFIG.symbol}` : stats.loading ? '…' : '—'}
        />
        <Stat label="24h high" value={stats.high > 0 ? fmt(stats.high, 8) : '—'} />
        <Stat label="24h low" value={stats.low > 0 ? fmt(stats.low, 8) : '—'} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Total supply" value={chain ? fmt(parseFloat(chain.totalSupply), 0) : marketLoading ? '…' : '—'} />
        <Stat
          label="Holders (est.)"
          value={holders !== null ? fmt(holders, 0) : holdersLoading ? '…' : '—'}
        />
        <Stat label="Your balance" value={chain?.balance ? `${fmt(parseFloat(chain.balance), 4)} ${symbol}` : '— connect wallet'} />
        <Stat label="Creator" value={market?.creator ? `${market.creator.slice(0, 6)}…${market.creator.slice(-4)}` : 'Unknown'} mono />
      </div>


      {/* Chart + swap */}
      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 wolf-card rounded-3xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold">Price chart · {symbol}/{CHAIN_CONFIG.symbol}</h2>
            <span className="text-[10px] text-muted-foreground">from on-chain swap events</span>
          </div>
          {market?.pair ? (
            <PairChart
              pairAddress={market.pair}
              baseSymbol={symbol}
              quoteSymbol={CHAIN_CONFIG.symbol}
              height={340}
            />
          ) : (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {marketLoading ? 'Loading pool data…' : (
                <>
                  <div className="text-3xl mb-2">🌊</div>
                  <p className="font-semibold">No {symbol}/{CHAIN_CONFIG.symbol} pool yet</p>
                  <p className="text-xs mt-1">Add liquidity to start price discovery for this token.</p>
                  <Link to="/liquidity" className="inline-block mt-3 text-xs font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-wolf-pink to-wolf-gold text-white">
                    Add liquidity
                  </Link>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">Trade {symbol}</div>
          <SwapCard
            swap={swap}
            getAmountsOut={dex.getAmountsOut}
            getBestRoute={dex.getBestRoute}
            previewSwap={dex.previewSwap}
            getTokenBalance={dex.getTokenBalance}
            loading={dex.loading}
            txHash={dex.txHash}
            error={dex.error}
            isConnected={wallet.isConnected}
            onConnectClick={() => {}}
            initialFrom={NATIVE_TOKEN}
            initialTo={tokenInfo}
          />
          <div className="grid grid-cols-2 gap-2">
            <Link to="/liquidity" className="wolf-pool-card rounded-2xl p-3 text-center text-xs font-semibold hover:scale-[1.02] transition-transform">
              🌊 Add liquidity
            </Link>
            <Link to="/pools" className="wolf-pool-card rounded-2xl p-3 text-center text-xs font-semibold hover:scale-[1.02] transition-transform">
              🐺 Browse pools
            </Link>
          </div>
        </div>
      </div>

      {/* Trades + pools */}
      <div className="mt-5 grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2">
          <RecentTrades
            pair={market?.pair ?? null}
            tokenAddress={address}
            symbol={symbol}
            decimals={decimals}
          />
        </div>
        <TokenPools tokenAddress={address} symbol={symbol} decimals={decimals} />
      </div>


      <div className="mt-6 text-[11px] text-center text-muted-foreground">
        Network: {CHAIN_CONFIG.chainName} (Chain ID {CHAIN_CONFIG.chainId}) · Router {CONTRACTS.ROUTER.slice(0, 8)}…
      </div>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="wolf-card rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
