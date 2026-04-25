import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayEntry } from './useCasinoHistory';

/**
 * Daily quests + login streak + achievement badges for the casino.
 * Pure local-only (localStorage). Resets at midnight UTC each day.
 *
 * Quests progress is derived from the play entries the caller passes in
 * (so this hook stays decoupled from any specific data source). The
 * `claim()` function is no-op for now — quests "claim" by simply marking
 * them claimed in storage; future versions may mint an on-chain reward.
 */

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  goal: number;
  /** Reward label (cosmetic, no on-chain payout yet) */
  reward: string;
  /** Compute current progress from today's plays */
  progress: (todays: PlayEntry[]) => number;
}

export interface QuestState {
  id: string;
  progress: number;
  goal: number;
  done: boolean;
  claimed: boolean;
  def: QuestDef;
}

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
  /** Returns true if unlocked given the full history + streak */
  test: (all: PlayEntry[], streakDays: number) => boolean;
}

const QUEST_DEFS: QuestDef[] = [
  {
    id: 'play5',
    title: 'Warm Up',
    desc: 'Play 5 games today',
    goal: 5,
    reward: '+5 XP',
    progress: (t) => t.length,
  },
  {
    id: 'win1',
    title: 'First Blood',
    desc: 'Win at least 1 game today',
    goal: 1,
    reward: '+10 XP',
    progress: (t) => t.filter(e => e.win).length,
  },
  {
    id: 'wager01',
    title: 'High Roller',
    desc: 'Wager 0.1 zkLTC total today',
    goal: 0.1,
    reward: '+15 XP',
    progress: (t) => Math.min(0.1, t.reduce((s, e) => s + (parseFloat(e.bet) || 0), 0)),
  },
  {
    id: 'variety3',
    title: 'Variety Wolf',
    desc: 'Try 3 different games today',
    goal: 3,
    reward: '+20 XP',
    progress: (t) => new Set(t.map(e => e.game)).size,
  },
];

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_play',  title: 'First Spin',     desc: 'Play your first game',          icon: '🎰', test: (all) => all.length >= 1 },
  { id: 'first_win',   title: 'Lucky Wolf',     desc: 'Win a game',                    icon: '🏆', test: (all) => all.some(e => e.win) },
  { id: 'play_50',     title: 'Regular',        desc: 'Play 50 games total',           icon: '🎯', test: (all) => all.length >= 50 },
  { id: 'win_10',      title: 'Winning Streak', desc: 'Win 10 games total',            icon: '🔥', test: (all) => all.filter(e => e.win).length >= 10 },
  { id: 'all_games',   title: 'Game Master',    desc: 'Play all 8 casino games',       icon: '👑', test: (all) => new Set(all.map(e => e.game)).size >= 8 },
  { id: 'streak_3',    title: '3-Day Howl',     desc: 'Play 3 days in a row',          icon: '📅', test: (_a, s) => s >= 3 },
  { id: 'streak_7',    title: 'Week of Wolves', desc: '7-day login streak',            icon: '🌙', test: (_a, s) => s >= 7 },
  { id: 'big_win',     title: 'Jackpot',        desc: 'Single payout > 0.05 zkLTC',    icon: '💎', test: (all) => all.some(e => parseFloat(e.payout) > 0.05) },
];

const KEY_STREAK = 'wolfdex.casino.streak.v1';
const KEY_QUESTS = 'wolfdex.casino.quests.v1';

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Filter entries to those happening "today" in UTC. */
function entriesToday(entries: PlayEntry[]): PlayEntry[] {
  const t = todayUTC();
  return entries.filter(e => new Date(e.ts).toISOString().slice(0, 10) === t);
}

/** Read & update streak; returns current streak length (in days). */
function readStreak(): { count: number; lastDay: string } {
  if (typeof window === 'undefined') return { count: 0, lastDay: '' };
  try {
    const raw = localStorage.getItem(KEY_STREAK);
    if (!raw) return { count: 0, lastDay: '' };
    return JSON.parse(raw);
  } catch { return { count: 0, lastDay: '' }; }
}

function writeStreak(s: { count: number; lastDay: string }) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY_STREAK, JSON.stringify(s)); } catch { /* quota */ }
}

function bumpStreak(): { count: number; lastDay: string } {
  const today = todayUTC();
  const s = readStreak();
  if (s.lastDay === today) return s;
  // Determine if yesterday was the last play day
  const y = new Date(); y.setUTCDate(y.getUTCDate() - 1);
  const ystr = y.toISOString().slice(0, 10);
  const next = { count: s.lastDay === ystr ? s.count + 1 : 1, lastDay: today };
  writeStreak(next);
  return next;
}

interface ClaimedMap { day: string; claimed: Record<string, boolean> }
function readClaimed(): ClaimedMap {
  if (typeof window === 'undefined') return { day: todayUTC(), claimed: {} };
  try {
    const raw = localStorage.getItem(KEY_QUESTS);
    if (!raw) return { day: todayUTC(), claimed: {} };
    const parsed = JSON.parse(raw) as ClaimedMap;
    if (parsed.day !== todayUTC()) return { day: todayUTC(), claimed: {} };
    return parsed;
  } catch { return { day: todayUTC(), claimed: {} }; }
}
function writeClaimed(c: ClaimedMap) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY_QUESTS, JSON.stringify(c)); } catch { /* quota */ }
}

export function useCasinoQuests(allEntries: PlayEntry[]) {
  const [streak, setStreak] = useState({ count: 0, lastDay: '' });
  const [claimed, setClaimed] = useState<ClaimedMap>({ day: todayUTC(), claimed: {} });

  useEffect(() => {
    setStreak(readStreak());
    setClaimed(readClaimed());
  }, []);

  // Bump streak whenever a new play lands today
  useEffect(() => {
    const todays = entriesToday(allEntries);
    if (todays.length > 0) {
      const s = bumpStreak();
      setStreak(s);
    }
    // intentionally tracking entries length only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntries.length]);

  const todays = useMemo(() => entriesToday(allEntries), [allEntries]);

  const quests: QuestState[] = useMemo(() =>
    QUEST_DEFS.map(def => {
      const progress = def.progress(todays);
      const done = progress >= def.goal;
      return {
        id: def.id,
        progress: Math.min(progress, def.goal),
        goal: def.goal,
        done,
        claimed: !!claimed.claimed[def.id],
        def,
      };
    }),
  [todays, claimed]);

  const claim = useCallback((id: string) => {
    setClaimed(prev => {
      const next = { day: todayUTC(), claimed: { ...prev.claimed, [id]: true } };
      writeClaimed(next);
      return next;
    });
  }, []);

  const achievements = useMemo(() =>
    ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.test(allEntries, streak.count) })),
  [allEntries, streak.count]);

  const xp = useMemo(() => {
    // 5 per play + 10 per win + 25 per achievement + 5 per streak day
    const plays = allEntries.length;
    const wins = allEntries.filter(e => e.win).length;
    const ach = achievements.filter(a => a.unlocked).length;
    return plays * 5 + wins * 10 + ach * 25 + streak.count * 5;
  }, [allEntries, achievements, streak.count]);

  return { quests, claim, streak: streak.count, achievements, xp };
}