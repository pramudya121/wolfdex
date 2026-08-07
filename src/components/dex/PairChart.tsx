import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { usePairOHLC, type Candle } from '@/hooks/usePairOHLC';

/**
 * Per-pair OHLC chart powered by on-chain Swap event indexing.
 * Renders a Recharts ComposedChart that draws candles as low/high
 * vertical bars + open/close range bars, plus a volume row underneath.
 *
 * Props are minimal so it drops into any modal/drawer/page.
 */

const INTERVALS: { label: string; value: number }[] = [
  { label: '15m', value: 900 },
  { label: '1h',  value: 3600 },
  { label: '4h',  value: 14400 },
  { label: '1d',  value: 86400 },
];

/** Visible time window (seconds) applied on top of the indexed candles. */
const RANGES: { label: string; seconds: number }[] = [
  { label: '1D',  seconds: 86_400 },
  { label: '7D',  seconds: 604_800 },
  { label: '30D', seconds: 2_592_000 },
  { label: 'All', seconds: 0 },
];

export default function PairChart({
  pairAddress,
  baseSymbol,
  quoteSymbol,
  height = 320,
  defaultInterval = 3600,
}: {
  pairAddress: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  height?: number;
  defaultInterval?: number;
}) {
  const [interval, setInterval] = useState(defaultInterval);
  const [range, setRange] = useState(0);
  const [invert, setInvert] = useState(false);
  const { candles: allCandles, loading, error, refresh } = usePairOHLC(pairAddress, { interval, invert });

  const candles = useMemo(() => {
    if (range === 0 || allCandles.length === 0) return allCandles;
    const cutoff = allCandles[allCandles.length - 1].t - range;
    const win = allCandles.filter(c => c.t >= cutoff);
    return win.length > 0 ? win : allCandles;
  }, [allCandles, range]);


  const data = useMemo(() =>
    candles.map((c: Candle) => ({
      ...c,
      label: new Date(c.t * 1000).toLocaleString('en', {
        month: 'short', day: 'numeric',
        hour: interval < 86400 ? '2-digit' : undefined,
      }),
      // Recharts can't draw real candles natively — we fake it with two bars:
      //   - wickRange: [low, high] thin gray bar
      //   - bodyRange: [min(open,close), max(open,close)] colored bar
      wick: [c.low, c.high],
      body: [Math.min(c.open, c.close), Math.max(c.open, c.close)],
      bullish: c.close >= c.open,
    })),
  [candles, interval]);

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const firstPrice = candles.length > 0 ? candles[0].open : 0;
  const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  const base = invert ? quoteSymbol : baseSymbol;
  const quote = invert ? baseSymbol : quoteSymbol;

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {base ?? 'BASE'} / {quote ?? 'QUOTE'}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-wolf-gold">
              {lastPrice > 0 ? lastPrice.toPrecision(6) : '—'}
            </span>
            {candles.length > 1 && (
              <span className={`text-xs font-bold font-mono ${change >= 0 ? 'text-wolf-green' : 'text-wolf-red'}`}>
                {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {INTERVALS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setInterval(opt.value)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                interval === opt.value
                  ? 'bg-wolf-gold text-wolf-dark'
                  : 'bg-wolf-surface text-muted-foreground hover:text-wolf-gold'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => setInvert(v => !v)}
            className="px-2 py-1 rounded text-[10px] font-bold bg-wolf-surface text-muted-foreground hover:text-wolf-pink transition-colors"
            title="Invert price"
          >
            ⇅
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-2 py-1 rounded text-[10px] font-bold bg-wolf-surface text-muted-foreground hover:text-wolf-cyan transition-colors disabled:opacity-50"
          >
            {loading ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {/* Chart */}
      {error ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-red/30 p-6 text-center text-xs text-wolf-red">
          Failed to load price history: {error}
        </div>
      ) : loading && data.length === 0 ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-border/30 p-12 text-center text-xs text-muted-foreground">
          Indexing on-chain Swap events…
        </div>
      ) : data.length === 0 ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-border/30 p-12 text-center text-xs text-muted-foreground">
          No swaps in the recent window — check back after some trades land.
        </div>
      ) : (
        <div className="rounded-xl bg-wolf-surface/30 border border-wolf-border/30 p-2">
          <ResponsiveContainer width="100%" height={height}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.04 280 / 30%)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'oklch(0.65 0.02 280)' }} />
              <YAxis
                yAxisId="price"
                domain={['auto', 'auto']}
                tick={{ fontSize: 9, fill: 'oklch(0.65 0.02 280)' }}
                tickFormatter={(v) => Number(v).toPrecision(4)}
                width={60}
              />
              <YAxis yAxisId="vol" orientation="right" hide domain={[0, 'dataMax']} />
              <Tooltip
                contentStyle={{
                  background: 'oklch(0.16 0.06 280)',
                  border: '1px solid oklch(0.78 0.16 85 / 40%)',
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(value: any, name: any, item: any) => {
                  const n = String(name ?? '');
                  if (n === 'wick' || n === 'body') {
                    const c = item?.payload;
                    return [`O ${c.open.toPrecision(5)}  H ${c.high.toPrecision(5)}  L ${c.low.toPrecision(5)}  C ${c.close.toPrecision(5)}`, 'OHLC'];
                  }
                  if (n === 'volume') return [Number(value).toFixed(4), `Vol (${quote ?? ''})`];
                  return [value, n];
                }}
              />
              {/* Wick (low → high) */}
              <Bar yAxisId="price" dataKey="wick" fill="oklch(0.65 0.02 280 / 70%)" barSize={1.5} isAnimationActive={false} />
              {/* Body (open ↔ close) — colored per direction */}
              <Bar yAxisId="price" dataKey="body" barSize={6} isAnimationActive={false}
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props;
                  const fill = payload.bullish ? 'oklch(0.65 0.20 150)' : 'oklch(0.55 0.25 25)';
                  return <rect x={x} y={y} width={width} height={Math.max(height, 1)} fill={fill} rx={1} />;
                }}
              />
              {/* Volume bars — drawn on the same chart with hidden axis */}
              <Bar yAxisId="vol" dataKey="volume" fill="oklch(0.65 0.25 330 / 35%)" barSize={4} isAnimationActive={false} />
              {lastPrice > 0 && (
                <ReferenceLine yAxisId="price" y={lastPrice} stroke="oklch(0.78 0.16 85 / 80%)" strokeDasharray="4 4" />
              )}
              {/* Close-line for trend clarity */}
              <Line yAxisId="price" type="monotone" dataKey="close" stroke="oklch(0.78 0.16 85)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="text-[9px] text-muted-foreground text-center pt-1">
            On-chain Swap events · {candles.length} candles · cached 90s
          </div>
        </div>
      )}
    </div>
  );
}