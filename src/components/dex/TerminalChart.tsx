/**
 * TerminalChart — a professional trading-terminal chart (candlesticks +
 * volume) powered by lightweight-charts, fed by on-chain Swap events.
 *
 * SSR-safe: the library is dynamically imported inside useEffect, so the
 * module is never evaluated on the server.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  UTCTimestamp,
} from 'lightweight-charts';
import { usePairOHLC, type Candle } from '@/hooks/usePairOHLC';

const INTERVALS: { label: string; value: number }[] = [
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1h', value: 3600 },
  { label: '4h', value: 14400 },
  { label: '1d', value: 86400 },
];

const RANGES: { label: string; seconds: number }[] = [
  { label: '1H', seconds: 3_600 },
  { label: '4H', seconds: 14_400 },
  { label: '1D', seconds: 86_400 },
  { label: '7D', seconds: 604_800 },
  { label: '30D', seconds: 2_592_000 },
  { label: 'All', seconds: 0 },
];

const UP = 'oklch(0.68 0.19 152)';
const DOWN = 'oklch(0.60 0.24 25)';
const GOLD = 'oklch(0.80 0.16 85)';

/** Sensible precision for the price axis (handles sub-cent memecoins). */
function pricePrecision(p: number): number {
  if (p >= 1000) return 2;
  if (p >= 1) return 4;
  if (p >= 0.01) return 6;
  if (p >= 0.000001) return 8;
  return 12;
}

export default function TerminalChart({
  pairAddress,
  baseSymbol,
  quoteSymbol,
  height = 380,
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
  const [mode, setMode] = useState<'candles' | 'area'>('candles');
  const { candles: allCandles, loading, error, refresh } = usePairOHLC(pairAddress, { interval, invert });

  const candles = useMemo(() => {
    if (range === 0 || allCandles.length === 0) return allCandles;
    const cutoff = allCandles[allCandles.length - 1].t - range;
    const win = allCandles.filter(c => c.t >= cutoff);
    return win.length > 0 ? win : allCandles;
  }, [allCandles, range]);

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const firstPrice = candles.length > 0 ? candles[0].open : 0;
  const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;

  const base = invert ? quoteSymbol : baseSymbol;
  const quote = invert ? baseSymbol : quoteSymbol;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null);
  const volRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  // Create (or recreate on mode change) the chart. The library is imported
  // dynamically so SSR never evaluates it.
  useEffect(() => {
    let disposed = false;
    let chart: IChartApi | null = null;
    setReady(false);

    // The chart container only renders once candles exist, so wait for data
    // before creating the chart (see the [hasData] dependency below).
    if (!hasData) return;
    if (!containerRef.current) {
      // Container not mounted yet this paint — retry on the next frame.
      const raf = requestAnimationFrame(() => setReady(r => !r ? r : r)); // no-op keep effect alive
      void raf;
    }

    (async () => {
      const LC = await import('lightweight-charts');
      const el = containerRef.current;
      if (disposed || !el) return;

      chart = LC.createChart(el, {
        autoSize: true,
        layout: {
          background: { color: 'transparent' },
          textColor: 'oklch(0.68 0.02 280)',
          fontSize: 10,
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: 'oklch(0.30 0.04 280 / 22%)' },
          horzLines: { color: 'oklch(0.30 0.04 280 / 22%)' },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.26 } },
        timeScale: {
          borderVisible: false,
          timeVisible: interval < 86400,
          secondsVisible: false,
        },
        crosshair: {
          mode: LC.CrosshairMode.Normal,
          vertLine: { color: 'oklch(0.80 0.16 85 / 55%)', labelBackgroundColor: 'oklch(0.35 0.08 85)' },
          horzLine: { color: 'oklch(0.80 0.16 85 / 55%)', labelBackgroundColor: 'oklch(0.35 0.08 85)' },
        },
        localization: { priceFormatter: (p: number) => p.toPrecision(pricePrecision(p)) },
      });

      const precision = pricePrecision(lastPrice || 1);
      const priceSeries =
        mode === 'candles'
          ? chart.addSeries(LC.CandlestickSeries, {
              upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN,
              wickUpColor: UP, wickDownColor: DOWN,
              priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
            })
          : chart.addSeries(LC.AreaSeries, {
              lineColor: GOLD, lineWidth: 2,
              topColor: 'oklch(0.78 0.16 85 / 30%)', bottomColor: 'oklch(0.78 0.16 85 / 0%)',
              priceFormat: { type: 'price', precision, minMove: Math.pow(10, -precision) },
            });

      const volSeries = chart.addSeries(LC.HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        color: 'oklch(0.65 0.25 330 / 40%)',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

      chart.subscribeCrosshairMove(param => {
        const legend = legendRef.current;
        if (!legend) return;
        const data = param.seriesData.get(priceSeries) as
          | { open?: number; close?: number; high?: number; low?: number; value?: number }
          | undefined;
        if (!data || param.time === undefined) {
          const last = candlesRef.current[candlesRef.current.length - 1];
          legend.textContent = last ? ohlcText(last, mode) : '';
          return;
        }
        legend.textContent =
          mode === 'candles' && data.open !== undefined
            ? `O ${data.open.toPrecision(5)}  H ${data.high!.toPrecision(5)}  L ${data.low!.toPrecision(5)}  C ${data.close!.toPrecision(5)}`
            : data.value !== undefined
              ? `${data.value.toPrecision(5)}`
              : '';
      });

      if (disposed) {
        chart.remove();
        return;
      }
      chartRef.current = chart;
      priceRef.current = priceSeries;
      volRef.current = volSeries;
      priceLineRef.current = null;
      setReady(true);
    })();

    return () => {
      disposed = true;
      chart?.remove();
      chartRef.current = null;
      priceRef.current = null;
      volRef.current = null;
      priceLineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Feed data into the chart whenever candles change (live updates included).
  const candlesRef = useRef<Candle[]>([]);
  candlesRef.current = candles;
  const volColor = (c: Candle) => (c.close >= c.open ? 'oklch(0.68 0.19 152 / 45%)' : 'oklch(0.60 0.24 25 / 45%)');

  useEffect(() => {
    const chart = chartRef.current;
    const priceSeries = priceRef.current;
    const volSeries = volRef.current;
    if (!chart || !priceSeries || !volSeries || candles.length === 0) return;

    priceSeries.setData(
      candles.map(c =>
        mode === 'candles'
          ? { time: c.t as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }
          : { time: c.t as UTCTimestamp, value: c.close },
      ) as never,
    );
    volSeries.setData(
      candles.map(c => ({ time: c.t as UTCTimestamp, value: c.volume, color: volColor(c) })) as never,
    );

    const last = candles[candles.length - 1];
    if (priceLineRef.current) {
      try { priceSeries.removePriceLine(priceLineRef.current); } catch { /* series may be fresh */ }
      priceLineRef.current = null;
    }
    priceLineRef.current = priceSeries.createPriceLine({
      price: last.close,
      color: GOLD,
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: '',
    });

    chart.timeScale().fitContent();
    const legend = legendRef.current;
    if (legend) legend.textContent = ohlcText(last, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, ready, mode]);

  const setParamInterval = (v: number) => {
    setInterval(v);
    if (v >= 86400) setRange(r => (r === 0 ? r : Math.max(r, 86_400)));
  };

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
          <div ref={legendRef} className="text-[10px] font-mono text-muted-foreground h-3" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg bg-wolf-surface/60 p-0.5">
            {RANGES.map(opt => (
              <button
                key={opt.label}
                onClick={() => setRange(opt.seconds)}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  range === opt.seconds ? 'bg-wolf-pink text-white' : 'text-muted-foreground hover:text-wolf-pink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-wolf-surface/60 p-0.5">
            {INTERVALS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setParamInterval(opt.value)}
                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors ${
                  interval === opt.value ? 'bg-wolf-gold text-wolf-dark' : 'text-muted-foreground hover:text-wolf-gold'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setMode(m => (m === 'candles' ? 'area' : 'candles'))}
            className="px-2 py-1 rounded text-[10px] font-bold bg-wolf-surface text-muted-foreground hover:text-wolf-gold transition-colors"
            title="Toggle chart type"
          >
            {mode === 'candles' ? '🕯 Candles' : '📈 Area'}
          </button>
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

      {/* Chart body */}
      {error ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-red/30 p-6 text-center text-xs text-wolf-red">
          Failed to load price history: {error}
        </div>
      ) : loading && candles.length === 0 ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-border/30 p-12 text-center text-xs text-muted-foreground">
          Indexing on-chain Swap events…
        </div>
      ) : candles.length === 0 ? (
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-border/30 p-12 text-center text-xs text-muted-foreground">
          No swaps in the recent window — check back after some trades land.
        </div>
      ) : (
        <div className="rounded-xl bg-wolf-surface/30 border border-wolf-border/30 p-1 relative">
          <div ref={containerRef} style={{ height }} className="w-full min-w-0" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground bg-wolf-surface/60 rounded-xl">
              Loading terminal…
            </div>
          )}
          <div className="text-[9px] text-muted-foreground text-center pt-1">
            On-chain Swap events · {candles.length} candles · live per block
          </div>
        </div>
      )}
    </div>
  );
}

function ohlcText(c: Candle, mode: 'candles' | 'area'): string {
  if (mode === 'area') return `${c.close.toPrecision(5)}`;
  return `O ${c.open.toPrecision(5)}  H ${c.high.toPrecision(5)}  L ${c.low.toPrecision(5)}  C ${c.close.toPrecision(5)}`;
}
