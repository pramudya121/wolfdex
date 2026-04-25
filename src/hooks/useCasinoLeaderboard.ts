import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, CHAIN_CONFIG } from '@/config/contracts';
import { CASINO_ABI } from '@/config/abis';

/**
 * Global on-chain leaderboard, computed by streaming the GameSettled events
 * from the casino contract for the last ~10k blocks. Players are ranked by
 * total payout (winnings) — net of bets so we display a true "won" column.
 *
 * Cached in localStorage for 5 minutes to avoid hammering the RPC. A manual
 * refresh always bypasses the cache.
 */

export interface LeaderRow {
  player: string;
  plays: number;
  wins: number;
  totalBet: number;     // zkLTC, sum of bet amounts (we approximate from payout / 2 for losses; see below)
  totalPayout: number;  // zkLTC, sum of payout (wins only — losses emit payout=0)
}

const CACHE_KEY = 'wolfdex.casino.leaderboard.v1';
const CACHE_TTL = 5 * 60 * 1000;
const LOOKBACK_BLOCKS = 10000;

interface Cache { rows: LeaderRow[]; fetchedAt: number; latestBlock: number }

function readCache(): Cache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cache;
    if (Date.now() - c.fetchedAt > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}

function writeCache(c: Cache) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function useCasinoLeaderboard() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestBlock, setLatestBlock] = useState<number>(0);

  const fetchOnce = useCallback(async (force = false) => {
    if (!force) {
      const c = readCache();
      if (c) { setRows(c.rows); setLatestBlock(c.latestBlock); return; }
    }
    setLoading(true); setError(null);
    try {
      const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
      const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, provider);
      const head = await provider.getBlockNumber();
      const from = Math.max(0, head - LOOKBACK_BLOCKS);
      const filter = c.filters.GameSettled();
      const logs = await c.queryFilter(filter, from, head);
      const map = new Map<string, LeaderRow>();
      for (const l of logs) {
        const player = (l.args!.player as string).toLowerCase();
        const win = l.args!.win as boolean;
        const payoutWei = l.args!.payout as ethers.BigNumber;
        const payout = parseFloat(ethers.utils.formatEther(payoutWei));
        const cur = map.get(player) ?? { player, plays: 0, wins: 0, totalBet: 0, totalPayout: 0 };
        cur.plays += 1;
        if (win) { cur.wins += 1; cur.totalPayout += payout; }
        map.set(player, cur);
      }
      const sorted = [...map.values()]
        .sort((a, b) => b.totalPayout - a.totalPayout)
        .slice(0, 25);
      setRows(sorted);
      setLatestBlock(head);
      writeCache({ rows: sorted, fetchedAt: Date.now(), latestBlock: head });
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOnce(false); }, [fetchOnce]);

  return { rows, loading, error, latestBlock, refresh: () => fetchOnce(true) };
}