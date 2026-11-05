/**
 * marketMetricsDb — Supabase cache layer for Market page metrics.
 *
 * On-chain reads remain the source of truth; this table only stores the last
 * known price/liquidity snapshot per token so the Market grid and token detail
 * pages render instantly on first paint (no "awaiting first pool" flicker)
 * and share updates across visitors in realtime.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MarketMetricRow {
  token_address: string;
  pair_address: string | null;
  price: number;
  price_usd: number;
  liquidity: number;
  liquidity_usd: number;
  change_24h: number;
  updated_at?: string;
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

function toRow(m: Partial<MarketMetricRow>): MarketMetricRow | null {
  const token = String(m.token_address ?? '');
  if (!ADDR_RE.test(token)) return null;
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
  return {
    token_address: token.toLowerCase(),
    pair_address: m.pair_address && ADDR_RE.test(m.pair_address) ? m.pair_address : null,
    price: num(m.price),
    price_usd: num(m.price_usd),
    liquidity: num(m.liquidity),
    liquidity_usd: num(m.liquidity_usd),
    change_24h: typeof m.change_24h === 'number' && isFinite(m.change_24h) ? m.change_24h : 0,
  };
}

/** Load the whole snapshot cache, keyed by lowercase token address. */
export async function fetchSnapshots(): Promise<Record<string, MarketMetricRow>> {
  try {
    const { data, error } = await supabase
      .from('market_metrics')
      .select('token_address, pair_address, price, price_usd, liquidity, liquidity_usd, change_24h, updated_at')
      .order('updated_at', { ascending: false });
    if (error || !data) return {};
    const out: Record<string, MarketMetricRow> = {};
    for (const raw of data) {
      const row = toRow(raw as Partial<MarketMetricRow>);
      if (row) out[row.token_address] = row;
    }
    return out;
  } catch {
    return {};
  }
}

/** Upsert rows in one round-trip; invalid rows are dropped silently. */
export async function upsertSnapshots(rows: Array<Partial<MarketMetricRow>>): Promise<void> {
  const clean = rows.map(toRow).filter((r): r is MarketMetricRow => !!r);
  if (clean.length === 0) return;
  try {
    await supabase.from('market_metrics').upsert(clean, { onConflict: 'token_address' });
  } catch {
    /* cache writes must never break the page */
  }
}

const THROTTLE_MS = 30_000;
let lastUpsert = 0;
let pending: MarketMetricRow[] = [];

/**
 * Throttled upsert — merges rows into a pending buffer and flushes at most
 * once every 30s so the public PostgREST quota is never hammered by the
 * progressive on-chain batches.
 */
export function queueSnapshotUpsert(rows: Array<Partial<MarketMetricRow>>): void {
  for (const raw of rows) {
    const row = toRow(raw);
    if (row) {
      pending = pending.filter(p => p.token_address !== row.token_address);
      pending.push(row);
    }
  }
  const now = Date.now();
  if (now - lastUpsert < THROTTLE_MS || pending.length === 0) return;
  const batch = pending;
  pending = [];
  lastUpsert = now;
  void upsertSnapshots(batch);
}

/** Flush whatever is pending right now (used on page refresh). */
export function flushSnapshotUpsert(): void {
  if (pending.length === 0) return;
  const batch = pending;
  pending = [];
  lastUpsert = Date.now();
  void upsertSnapshots(batch);
}

/**
 * Realtime subscription. Returns an unsubscribe function.
 * Uses a unique channel name per call so StrictMode/hot-reload remounts
 * never reuse a torn-down channel.
 */
export function subscribeSnapshots(cb: (rows: MarketMetricRow[]) => void): () => void {
  const channel = supabase.channel(`market_metrics_changes_${Math.random().toString(36).slice(2)}`);
  channel
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'market_metrics' },
      (payload: any) => {
        const row = toRow(payload?.new ?? payload?.old);
        if (row) cb([row]);
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
