/**
 * RecentTrades — live buy/sell feed for a token's AMM pair,
 * built from on-chain Swap events.
 */
import { motion } from 'framer-motion';
import { usePairTrades } from '@/hooks/usePairTrades';
import { CHAIN_CONFIG } from '@/config/contracts';
import { fmt } from './MarketTokenCard';

function ago(ts: number) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function RecentTrades({
  pair,
  tokenAddress,
  symbol,
  decimals,
}: {
  pair: string | null;
  tokenAddress: string;
  symbol: string;
  decimals: number;
}) {
  const { trades, loading, error, refresh } = usePairTrades(pair, tokenAddress, decimals, 25);

  return (
    <div className="wolf-card rounded-3xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold">Recent trades · {symbol}</h2>
        <button
          onClick={() => refresh()}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors"
        >
          {loading ? 'Loading…' : '🔄 Refresh'}
        </button>
      </div>

      {!pair && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No pool yet — trades appear once liquidity is added.
        </p>
      )}
      {pair && error && <p className="text-xs text-wolf-red py-4 text-center">{error}</p>}
      {pair && !error && trades.length === 0 && (
        <p className="text-xs text-muted-foreground py-6 text-center">
          {loading ? 'Scanning on-chain swaps…' : 'No swaps in the recent block window.'}
        </p>
      )}

      {trades.length > 0 && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-semibold py-2 px-1">Side</th>
                <th className="text-right font-semibold py-2 px-1">{symbol}</th>
                <th className="text-right font-semibold py-2 px-1">{CHAIN_CONFIG.symbol}</th>
                <th className="text-right font-semibold py-2 px-1">Price</th>
                <th className="text-right font-semibold py-2 px-1">Age</th>
                <th className="text-right font-semibold py-2 px-1">Tx</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => (
                <motion.tr
                  key={`${t.hash}-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="border-t border-wolf-border/20 hover:bg-wolf-surface/50 transition-colors"
                >
                  <td className="py-2 px-1">
                    <span className={`font-bold ${t.side === 'buy' ? 'text-wolf-green' : 'text-wolf-red'}`}>
                      {t.side === 'buy' ? '▲ Buy' : '▼ Sell'}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right font-mono">{fmt(t.tokenAmount, 4)}</td>
                  <td className="py-2 px-1 text-right font-mono">{fmt(t.nativeAmount, 4)}</td>
                  <td className="py-2 px-1 text-right font-mono">{fmt(t.price, 8)}</td>
                  <td className="py-2 px-1 text-right text-muted-foreground">{ago(t.ts)}</td>
                  <td className="py-2 px-1 text-right">
                    <a
                      href={`${CHAIN_CONFIG.blockExplorer}/tx/${t.hash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-wolf-pink hover:underline font-mono"
                    >
                      {t.hash.slice(0, 6)}…
                    </a>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
