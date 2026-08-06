/**
 * TokenPools — every AMM pool that contains this token, with live reserves.
 * Uses the shared (cached, multicall-batched) pairs snapshot from DexContext.
 */
import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS, getTokenByAddress } from '@/config/contracts';
import { getRegistryToken } from '@/hooks/useLaunchpadRegistry';
import { useDexContext } from '@/context/DexContext';
import { fmt } from './MarketTokenCard';

interface Row {
  pair: string;
  otherAddress: string;
  otherSymbol: string;
  otherLogo: string;
  tokenReserve: number;
  otherReserve: number;
  price: number;
}

function meta(addr: string) {
  if (addr.toLowerCase() === CONTRACTS.WETH.toLowerCase()) {
    return { symbol: CHAIN_CONFIG.symbol, logo: '/images/wdex-logo.png', decimals: 18 };
  }
  const curated = getTokenByAddress(addr);
  if (curated) return { symbol: curated.symbol, logo: curated.logo, decimals: curated.decimals };
  const reg = getRegistryToken(addr);
  if (reg) return { symbol: reg.symbol, logo: reg.logo_url || '/images/wdex-logo.png', decimals: reg.decimals };
  return { symbol: `${addr.slice(0, 6)}…`, logo: '/images/wdex-logo.png', decimals: 18 };
}

export default function TokenPools({
  tokenAddress,
  symbol,
  decimals,
}: {
  tokenAddress: string;
  symbol: string;
  decimals: number;
}) {
  const { getCachedPairsWithInfo } = useDexContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { pairs, infos } = await getCachedPairsWithInfo();
        const key = tokenAddress.toLowerCase();
        const out: Row[] = [];
        for (const p of pairs) {
          const info = infos[p];
          if (!info) continue;
          const t0 = info.token0.toLowerCase();
          const t1 = info.token1.toLowerCase();
          if (t0 !== key && t1 !== key) continue;
          const isToken0 = t0 === key;
          const otherAddress = isToken0 ? info.token1 : info.token0;
          const m = meta(otherAddress);
          const tokenReserve = parseFloat(
            ethers.utils.formatUnits(isToken0 ? info.reserve0 : info.reserve1, decimals),
          );
          const otherReserve = parseFloat(
            ethers.utils.formatUnits(isToken0 ? info.reserve1 : info.reserve0, m.decimals),
          );
          out.push({
            pair: p,
            otherAddress,
            otherSymbol: m.symbol,
            otherLogo: m.logo,
            tokenReserve,
            otherReserve,
            price: tokenReserve > 0 ? otherReserve / tokenReserve : 0,
          });
        }
        out.sort((a, b) => b.otherReserve - a.otherReserve);
        if (!cancelled) setRows(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getCachedPairsWithInfo, tokenAddress, decimals]);

  return (
    <div className="wolf-card rounded-3xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Pools with {symbol}</h2>
        <Link to="/pools" className="text-[10px] text-wolf-pink hover:underline">All pools →</Link>
      </div>

      {loading && rows.length === 0 && (
        <p className="text-xs text-muted-foreground py-6 text-center">Loading pools…</p>
      )}
      {!loading && rows.length === 0 && (
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground">No pools contain {symbol} yet.</p>
          <Link to="/liquidity" className="inline-block mt-3 text-xs font-bold px-4 py-2 rounded-xl bg-gradient-to-r from-wolf-pink to-wolf-gold text-white">
            Create the first pool
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.pair}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            className="flex items-center gap-3 p-3 rounded-2xl bg-wolf-surface/60 border border-wolf-border/30 hover:border-wolf-pink/40 transition-colors"
          >
            <div className="flex items-center -space-x-2 shrink-0">
              <img
                src={r.otherLogo}
                alt={`${r.otherSymbol} logo`}
                loading="lazy"
                className="w-8 h-8 rounded-full ring-2 ring-wolf-bg object-cover bg-wolf-surface"
                onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{symbol} / {r.otherSymbol}</div>
              <div className="text-[11px] text-muted-foreground font-mono truncate">
                {fmt(r.tokenReserve, 2)} {symbol} · {fmt(r.otherReserve, 2)} {r.otherSymbol}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Rate</div>
              <div className="text-xs font-mono font-bold">{fmt(r.price, 6)}</div>
            </div>
            <a
              href={`${CHAIN_CONFIG.blockExplorer}/address/${r.pair}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] px-2 py-1 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors shrink-0"
            >🔗</a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
