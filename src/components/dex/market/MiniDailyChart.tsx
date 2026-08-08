/**
 * MiniDailyChart — live daily (1D) price chart for a token card.
 *
 * Loads real on-chain daily candles from the token/WzkLTC pair, but only
 * once the card scrolls into view (IntersectionObserver) so a long Market
 * list never floods the RPC. Candles are shared/cached by usePairOHLC.
 * Falls back to the rolling local price samples when a pool has no swaps.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTRACTS } from '@/config/contracts';
import { usePairOHLC } from '@/hooks/usePairOHLC';
import Sparkline from './Sparkline';

export default function MiniDailyChart({
  pair,
  tokenAddress,
  fallback = [],
  width = 104,
  height = 36,
}: {
  pair: string | null;
  tokenAddress: string;
  fallback?: number[];
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setInView(true); },
      { rootMargin: '160px' },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [inView]);

  // Uniswap-V2 pairs order tokens by address: token0 is the lower one.
  // usePairOHLC prices token0 in token1, so invert when the token is token1.
  const invert = useMemo(
    () => tokenAddress.toLowerCase() > CONTRACTS.WETH.toLowerCase(),
    [tokenAddress],
  );

  const { candles, loading } = usePairOHLC(inView && pair ? pair : null, {
    interval: 86_400,
    invert,
  });

  const daily = candles.length > 1 ? candles.map(c => c.close) : [];
  const series = daily.length > 1 ? daily : fallback;
  const positive = series.length > 1 ? series[series.length - 1] >= series[0] : true;
  const label = daily.length > 1 ? '1D · live' : loading ? 'loading…' : 'live samples';

  return (
    <div ref={ref} className="flex flex-col items-end gap-0.5">
      <Sparkline data={series} positive={positive} width={width} height={height} className="text-muted-foreground" />
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
