import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '@/config/contracts';
import { useDexContext } from '@/context/DexContext';

export type Bucket = 'day' | 'week';

export interface SeriesPoint {
  t: number;
  date: string;
  swaps: number;
}

export interface HistoryStats {
  swaps24h: number;
  incomplete: boolean;
}

const EMPTY_STATS: HistoryStats = { swaps24h: 0, incomplete: false };
const CACHE_TTL = 5 * 60_000;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_WEEK = SECONDS_PER_DAY * 7;
const BLOCKS_PER_DAY_ESTIMATE = 43000;
const MAX_LOOKBACK_BLOCKS = 50000;
const CHUNK_BLOCKS = 5000;
const PAIR_BATCH_SIZE = 50;

interface CacheEntry {
  series: SeriesPoint[];
  stats: HistoryStats;
  latestBlock: number;
  fetchedAt: number;
  bucket: Bucket;
  windowDays: number;
  pairsHash: string;
}

function hashPairs(pairs: string[]) {
  const joined = pairs.map(pair => pair.toLowerCase()).sort().join('|');
  let hash = 2166136261;
  for (let index = 0; index < joined.length; index += 1) {
    hash = Math.imul(hash ^ joined.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheKey(bucket: Bucket, days: number, pairsHash: string) {
  return `wolfdex.analytics.history.${bucket}.${days}.${pairsHash}.v2`;
}

function readCache(bucket: Bucket, days: number, pairsHash: string): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(bucket, days, pairsHash));
    if (!raw) return null;
    const cache = JSON.parse(raw) as CacheEntry;
    return Date.now() - cache.fetchedAt <= CACHE_TTL ? cache : null;
  } catch {
    return null;
  }
}

function writeCache(cache: CacheEntry) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(cache.bucket, cache.windowDays, cache.pairsHash), JSON.stringify(cache));
  } catch {
    // Analytics remains usable when browser storage is unavailable or full.
  }
}

export function useHistoricalAnalytics(opts?: { bucket?: Bucket; windowDays?: number }) {
  const bucket = opts?.bucket ?? 'day';
  const windowDays = opts?.windowDays ?? 1;
  const { getCachedPairsWithInfo } = useDexContext();
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestBlock, setLatestBlock] = useState(0);
  const [stats, setStats] = useState<HistoryStats>(EMPTY_STATS);

  const fetchOnce = useCallback(async (force = false) => {
    setError(null);
    try {
      const cache = await getCachedPairsWithInfo(false);
      const pairs = cache.pairs;
      if (pairs.length === 0) {
        setSeries([]);
        setStats(EMPTY_STATS);
        setLatestBlock(0);
        return;
      }

      const pairsHash = hashPairs(pairs);
      if (!force) {
        const cached = readCache(bucket, windowDays, pairsHash);
        if (cached) {
          setSeries(cached.series);
          setStats(cached.stats);
          setLatestBlock(cached.latestBlock);
          return;
        }
      }

      setLoading(true);
      const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
      const head = await provider.getBlockNumber();
      const lookback = Math.min(MAX_LOOKBACK_BLOCKS, windowDays * BLOCKS_PER_DAY_ESTIMATE);
      const fromBlock = Math.max(0, head - lookback);
      setLatestBlock(head);

      const rows: number[] = [];
      const swapTopic = ethers.utils.id('Swap(address,uint256,uint256,uint256,uint256,address)');
      let incomplete = false;

      for (let pairOffset = 0; pairOffset < pairs.length; pairOffset += PAIR_BATCH_SIZE) {
        const address = pairs.slice(pairOffset, pairOffset + PAIR_BATCH_SIZE);
        for (let start = fromBlock; start <= head; start += CHUNK_BLOCKS) {
          try {
            const toBlock = Math.min(head, start + CHUNK_BLOCKS - 1);
            const logs = await provider.send('eth_getLogs', [{
              address,
              topics: [swapTopic],
              fromBlock: ethers.utils.hexValue(start),
              toBlock: ethers.utils.hexValue(toBlock),
            }]) as Array<{ blockNumber: string }>;
            for (const log of logs) rows.push(Number.parseInt(log.blockNumber, 16));
          } catch {
            incomplete = true;
          }
        }
      }

      const blockNumbers = Array.from(new Set(rows));
      const timestamps = new Map<number, number>();
      for (let offset = 0; offset < blockNumbers.length; offset += 12) {
        const batch = blockNumbers.slice(offset, offset + 12);
        const blocks = await Promise.all(batch.map(block => provider.getBlock(block).catch(() => null)));
        batch.forEach((block, index) => {
          if (blocks[index]) timestamps.set(block, blocks[index]!.timestamp);
          else incomplete = true;
        });
      }

      const interval = bucket === 'day' ? SECONDS_PER_DAY : SECONDS_PER_WEEK;
      const buckets = new Map<number, number>();
      let swaps24h = 0;
      const now = Math.floor(Date.now() / 1000);
      for (const block of rows) {
        const timestamp = timestamps.get(block);
        if (!timestamp) {
          incomplete = true;
          continue;
        }
        const key = Math.floor(timestamp / interval) * interval;
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
        const age = now - timestamp;
        if (age >= 0 && age <= SECONDS_PER_DAY) swaps24h += 1;
      }

      const nextSeries = Array.from(buckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([timestamp, swaps]) => {
          const date = new Date(timestamp * 1000);
          return {
            t: timestamp,
            date: bucket === 'day'
              ? date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
              : `W${getWeekNum(date)}`,
            swaps,
          };
        });
      const nextStats = { swaps24h, incomplete };

      setSeries(nextSeries);
      setStats(nextStats);
      writeCache({
        series: nextSeries,
        stats: nextStats,
        latestBlock: head,
        fetchedAt: Date.now(),
        bucket,
        windowDays,
        pairsHash,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load recent swap activity');
    } finally {
      setLoading(false);
    }
  }, [getCachedPairsWithInfo, bucket, windowDays]);

  useEffect(() => {
    fetchOnce(false);
  }, [fetchOnce]);

  return { series, stats, loading, error, latestBlock, refresh: () => fetchOnce(true) };
}

function getWeekNum(date: Date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date.getTime() - firstDayOfYear.getTime()) / 86400000) + firstDayOfYear.getDay() + 1) / 7);
}
