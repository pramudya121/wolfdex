import { type ReactNode, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { TOKENS, type TokenInfo, CONTRACTS, isNativeToken } from '@/config/contracts';
import { CHAIN_CONFIG } from '@/config/contracts';
import { ROUTER_ABI, ERC20_ABI } from '@/config/abis';
import { toast } from 'sonner';

/** Tokens used as visual reels/segments. Same logos as wolfdex token list. */
export const REEL_TOKENS: TokenInfo[] = TOKENS.filter(
  (t, i, arr) => arr.findIndex(x => x.symbol === t.symbol) === i
);

/** Helpful payout multipliers per token (purely cosmetic — actual payout
 * comes from the chain). Used to label reward tiers on the UI. */
export const TOKEN_TIER: Record<string, number> = {
  WDEX: 50,
  LITVM: 25,
  zkLTC: 10,
  wzkLTC: 8,
  ETH: 6,
  BNB: 5,
  HYPE: 4,
  MON: 3,
};

export function pickTokenByByte(byte: number): TokenInfo {
  return REEL_TOKENS[byte % REEL_TOKENS.length];
}

/**
 * Deterministic decoder for a single byte from `resultBytes`.
 * `offsetFromEnd` = 0 → last byte, 1 → second-to-last, etc.
 *
 * IMPORTANT: returns null when the contract did not include enough data so
 * callers can branch on win/loss instead of falling back to Math.random.
 * This guarantees the UI animation always lands on the *actual* on-chain
 * outcome, not a coin-flip in the browser.
 */
export function decodeByte(bytesHex: string | undefined, offsetFromEnd = 0): number | null {
  if (!bytesHex || !bytesHex.startsWith('0x')) return null;
  const hex = bytesHex.slice(2);
  const byteIdx = hex.length - 2 - offsetFromEnd * 2;
  if (byteIdx < 0) return null;
  const v = parseInt(hex.slice(byteIdx, byteIdx + 2), 16);
  return Number.isNaN(v) ? null : v;
}

/**
 * Result of an auto-swap payout: includes tx hash AND the realized amount
 * received by the user, decoded from the ERC20 Transfer event in the receipt.
 *
 * `received` is the on-chain delivered amount in human units (string), or
 * null when no Transfer to the user was found (failed/skipped).
 *
 * `verified` is true ONLY when we successfully read a Transfer(... → user)
 * log from the ERC20 token contract — proving on-chain delivery.
 */
export interface AutoSwapResult {
  txHash: string | null;
  received: string | null;        // human units, e.g. "0.5123"
  receivedWei: ethers.BigNumber | null;
  verified: boolean;
  status: 'confirmed' | 'failed' | 'skipped';
  reason?: string;
}

/**
 * Auto-swap payout zkLTC → reward token via WolfDex Router.
 * Best-effort: amountOutMin = 0 (since payout is small & we want tx to land).
 * Skips if reward token is native zkLTC or wrapped zkLTC (already same asset).
 *
 * AFTER the swap confirms, we verify on-chain delivery by parsing the receipt
 * for an ERC20 Transfer(_, user, amount) emitted by the reward token. The
 * decoded `amount` is the GROUND TRUTH of what the user actually received —
 * label rendering should prefer this over any hardcoded reward amount.
 */
export async function autoSwapPayout(
  signer: ethers.Signer | null,
  address: string | null,
  rewardToken: TokenInfo,
  payoutWei: ethers.BigNumber,
): Promise<AutoSwapResult> {
  if (!signer || !address) return { txHash: null, received: null, receivedWei: null, verified: false, status: 'skipped', reason: 'no signer' };
  if (payoutWei.isZero()) return { txHash: null, received: null, receivedWei: null, verified: false, status: 'skipped', reason: 'zero payout' };
  // Native or wrapped — no swap needed
  if (isNativeToken(rewardToken.address)) return { txHash: null, received: null, receivedWei: null, verified: false, status: 'skipped', reason: 'native token' };
  if (rewardToken.address.toLowerCase() === CONTRACTS.WETH.toLowerCase()) return { txHash: null, received: null, receivedWei: null, verified: false, status: 'skipped', reason: 'wrapped native' };
  try {
    const router = new ethers.Contract(CONTRACTS.ROUTER, ROUTER_ABI, signer);
    const path = [CONTRACTS.WETH, rewardToken.address];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const tx = await router.swapExactETHForTokens(0, path, address, deadline, { value: payoutWei });
    const receipt = await tx.wait();

    // Verify: scan logs for ERC20 Transfer(_, user, value) emitted by rewardToken
    const erc20Iface = new ethers.utils.Interface(ERC20_ABI);
    const userLc = address.toLowerCase();
    const tokenLc = rewardToken.address.toLowerCase();
    let receivedWei = ethers.constants.Zero;
    let verified = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenLc) continue;
      try {
        const parsed = erc20Iface.parseLog(log);
        if (parsed.name === 'Transfer' && parsed.args.to.toLowerCase() === userLc) {
          receivedWei = receivedWei.add(parsed.args.value);
          verified = true;
        }
      } catch { /* not Transfer */ }
    }
    const received = verified ? ethers.utils.formatUnits(receivedWei, 18) : null;
    if (verified) {
      toast.success(`Reward verified: ${parseFloat(received!).toFixed(6)} ${rewardToken.symbol} on-chain`);
    } else {
      toast.success(`Payout swapped → ${rewardToken.symbol}`);
    }
    return { txHash: receipt.transactionHash, received, receivedWei, verified, status: 'confirmed' };
  } catch (e: any) {
    toast.error(`Auto-swap to ${rewardToken.symbol} failed — kept as zkLTC`);
    return { txHash: null, received: null, receivedWei: null, verified: false, status: 'failed', reason: friendlyError(e) };
  }
}

export function GameShell({
  title, subtitle, icon, children, accent = 'pink',
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
  accent?: 'pink' | 'gold' | 'cyan' | 'green';
}) {
  const accentColor = {
    pink:  'from-wolf-red to-wolf-pink',
    gold:  'from-wolf-gold to-wolf-red',
    cyan:  'from-wolf-cyan to-wolf-purple',
    green: 'from-wolf-green to-wolf-cyan',
  }[accent];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="casino-card p-6 md:p-7 casino-stage"
    >
      <div className="flex items-start justify-between mb-5 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accentColor} flex items-center justify-center text-xl shadow-lg`}>
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-bold casino-title">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
      </div>
      {children}
    </motion.div>
  );
}

/**
 * UI-enforced minimum bet for ALL casino games.
 * Even if the on-chain minBet is lower, the interface refuses anything below
 * this value to keep stakes meaningful and avoid dust amounts in the UX.
 */
export const UI_MIN_BET_ZK = 0.01;
export const UI_MIN_BET_STR = '0.01';

/** Effective minimum to enforce in the UI = max(on-chain min, UI floor). */
export function effectiveMinBet(chainMin: string): string {
  const c = parseFloat(chainMin || '0');
  return (isFinite(c) && c > UI_MIN_BET_ZK ? c : UI_MIN_BET_ZK).toString();
}

/**
 * Validate the FINAL bet (after multiplier) against the on-chain
 * minBet/maxBet bounds plus the UI-enforced 0.01 zkLTC floor.
 * Returns a user-friendly error string, or null when the bet is valid.
 */
export function getBetError(
  bet: string,
  multiplier: number,
  min: string,
  max: string,
): string | null {
  if (!bet || bet === '0' || bet === '.') return 'Enter a bet amount';
  let wei: ethers.BigNumber;
  try {
    wei = ethers.utils.parseEther(bet || '0').mul(multiplier);
  } catch {
    return 'Invalid bet number';
  }
  if (wei.isZero()) return 'Bet must be greater than 0';
  // Apply UI floor — never allow anything below 0.01 zkLTC
  const uiMinW = ethers.utils.parseEther(UI_MIN_BET_STR);
  if (wei.lt(uiMinW)) return `Minimum bet is ${UI_MIN_BET_STR} zkLTC`;
  try {
    const minW = ethers.utils.parseEther(min || '0');
    const maxW = ethers.utils.parseEther(max || '0');
    if (!minW.isZero() && wei.lt(minW)) return `Below min bet (${parseFloat(min).toFixed(4)} zkLTC)`;
    if (!maxW.isZero() && wei.gt(maxW)) return `Above max bet (${parseFloat(max).toFixed(4)} zkLTC)`;
  } catch { /* min/max not loaded yet */ }
  return null;
}

/**
 * Map common EVM revert / wallet errors to short, friendly messages.
 * Falls back to the original message when nothing matches.
 */
export function friendlyError(e: any, fallback = 'Transaction failed'): string {
  const raw = (e?.shortMessage || e?.reason || e?.error?.message || e?.data?.message || e?.message || '').toString();
  const low = raw.toLowerCase();
  if (e?.code === 4001 || low.includes('user rejected') || low.includes('user denied')) return 'You rejected the transaction in your wallet';
  if (low.includes('insufficient funds')) return 'Wallet balance too low for this bet + gas';
  if (low.includes('bet size')) return 'Bet outside allowed range — adjust min/max';
  if (low.includes('paused') || low.includes('not active') || low.includes('isactive')) return 'Casino is currently paused';
  if (low.includes('bankroll') || low.includes('insufficient bankroll') || low.includes('payout')) return 'Casino bankroll too low for this bet — try a smaller amount';
  if (low.includes('execution reverted')) {
    // Try to surface the revert reason after the colon, if any
    const m = raw.match(/execution reverted:?\s*(.+)/i);
    if (m && m[1]) return `Reverted: ${m[1].trim().slice(0, 120)}`;
    return 'Transaction reverted on-chain';
  }
  if (low.includes('network') || low.includes('timeout')) return 'Network error — please retry';
  return raw.slice(0, 160) || fallback;
}

export type TxStatus = 'idle' | 'pending' | 'confirmed' | 'failed';

/* ============================================================
 * Sound effects — pure WebAudio synth, no external assets.
 * Respects a localStorage mute flag set by the casino UI.
 * ============================================================ */
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (localStorage.getItem('wolf-casino-muted') === '1') return null;
  if (!_audioCtx) {
    try {
      const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      _audioCtx = new Ctor();
    } catch { return null; }
  }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, when = 0) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export function playWinSound() {
  // Triumphant arpeggio C5 → E5 → G5 → C6
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, i * 0.09));
  // Sparkle on top
  tone(2093, 0.4, 'sine', 0.08, 0.4);
}

export function playLoseSound() {
  // Sad descending two-note buzz
  tone(220, 0.25, 'sawtooth', 0.14, 0);
  tone(174.6, 0.45, 'sawtooth', 0.14, 0.18);
}

export function playSpinSound() {
  // Quick whirring tick
  tone(880, 0.05, 'square', 0.08, 0);
  tone(660, 0.05, 'square', 0.08, 0.06);
  tone(990, 0.05, 'square', 0.08, 0.12);
}

/** Short, bright peg-strike "ping" used by Plinko on each bounce. */
export function tonePeg() {
  // Two quick metallic pings for a richer hit
  tone(1320, 0.08, 'triangle', 0.07, 0);
  tone(1980, 0.06, 'sine',     0.05, 0.01);
}

export function isCasinoMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('wolf-casino-muted') === '1';
}
export function setCasinoMuted(m: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('wolf-casino-muted', m ? '1' : '0');
}

/**
 * Unified win/lose notification: rich toast + matching sound.
 *
 * IMPORTANT: only fires when the underlying transaction was *confirmed*.
 * Pass `txStatus` so callers can centralize the gate here — failed/reverted
 * txs produce neither a toast nor a sound (the calling component still
 * surfaces a friendlyError() toast in its own catch block).
 */
export function notifyResult(opts: {
  game: string;
  win: boolean;
  payout?: string;
  rewardLabel?: string;
  txHash?: string;
  txStatus?: TxStatus;
}) {
  const { game, win, payout, rewardLabel, txHash, txStatus } = opts;
  // Gate: only notify on confirmed settlement. Anything else (pending/failed/idle)
  // is owned by the calling component (which shows the failure toast itself).
  if (txStatus && txStatus !== 'confirmed') return;
  if (win) {
    playWinSound();
    toast.success(`🏆 ${game} — YOU WIN!`, {
      description: rewardLabel
        ? `Reward: ${rewardLabel}${payout ? ` (~${parseFloat(payout).toFixed(5)} zkLTC paid)` : ''}`
        : `+${parseFloat(payout || '0').toFixed(5)} zkLTC paid to your wallet`,
      duration: 7000,
      action: txHash ? {
        label: 'View tx',
        onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`, '_blank'),
      } : undefined,
    });
  } else {
    playLoseSound();
    toast.error(`💀 ${game} — LOST`, {
      description: rewardLabel
        ? `Landed on ${rewardLabel} — better luck next spin 🐺`
        : 'No payout this round — try again 🐺',
      duration: 6000,
      action: txHash ? {
        label: 'View tx',
        onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`, '_blank'),
      } : undefined,
    });
  }
}

/**
 * Wheel rewards — TARGET reward amounts per token. These are the amounts the
 * payout (in zkLTC) is auto-swapped INTO when the wheel lands on that token.
 *
 * IMPORTANT: the actual on-chain prize is the `payout` value emitted in the
 * GameSettled event by the casino contract — NEVER trust these numbers as
 * the realized payout. Use `realizedRewardLabel(payoutZk, token, fallback)`
 * to render the post-tx label so the displayed amount always matches chain.
 *
 * Per spec (target labels for wheel segments):
 *   zkLTC : 0.00001
 *   ETH   : 0.5
 *   MON   : 0.9
 *   BNB   : 0.6
 *   LITVM : 0.88
 */
export const WHEEL_REWARD_AMOUNT: Record<string, number> = {
  zkLTC:  0.01,
  wzkLTC: 0.02,
  ETH:    0.5,
  MON:    0.9,
  BNB:    0.6,
  LITVM:  0.88,
  HYPE:   0.42,
  WDEX:   0.77,
};

/** Pre-spin segment label (target reward, NOT realized). */
export function rewardLabelFor(symbol: string): string {
  const amt = WHEEL_REWARD_AMOUNT[symbol] ?? 0.1;
  const str = amt < 0.01 ? amt.toFixed(4) : amt.toFixed(2);
  return `${parseFloat(str)} ${symbol}`;
}

/**
 * Post-confirmation label: shows the ACTUAL zkLTC payout from the chain
 * plus the target token (since auto-swap converts it). This guarantees
 * the user always sees what they actually received on-chain.
 */
export function realizedRewardLabel(payoutZk: string, symbol: string): string {
  const v = parseFloat(payoutZk || '0');
  const formatted = v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0';
  return `${formatted} zkLTC → ${symbol}`;
}

/**
 * Derive a deterministic 32-bit seed from a tx hash + result bytes, so the
 * wheel layout shown to the user is reproducible from on-chain data.
 * Falls back to 0 only when both inputs are empty.
 */
export function seedFromOnChain(txHash?: string | null, resultBytes?: string | null): number {
  const src = `${txHash || ''}${resultBytes || ''}`.replace(/^0x/, '');
  if (!src) return 0;
  // FNV-1a 32-bit hash over hex chars
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Tiny seeded PRNG (mulberry32) — exported so wheel components can derive
 * deterministic per-spin shuffles from the on-chain seed.
 */
export function mulberry32(seed: number) {
  let a = (seed || 1) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Zebra interleave WIN and LOST slots so they never cluster.
 * Pattern: WIN, LOST, WIN, LOST, … — then each *group* (wins / losts) is
 * shuffled independently with the seed so the order of which token sits at
 * which "win slot" is still randomized per spin, but the alternation is
 * guaranteed visually. Result: no two same-kind slots ever touch when the
 * counts are equal.
 *
 * If counts differ, the shorter group is distributed as evenly as possible.
 */
export function zebraInterleave<W, L>(wins: W[], losts: L[], seed: number): Array<{ kind: 'win'; v: W } | { kind: 'lost'; v: L }> {
  const rng = mulberry32(seed);
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const W = shuffle(wins);
  const L = shuffle(losts);
  const out: Array<{ kind: 'win'; v: W } | { kind: 'lost'; v: L }> = [];
  // Random starting kind so the wheel doesn't always begin with a WIN.
  let startWithWin = rng() < 0.5;
  // Force start kind to whichever group is larger so we never strand leftovers
  // at the end — keeps the alternation tight.
  if (W.length !== L.length) startWithWin = W.length > L.length;
  let wi = 0, li = 0;
  const total = W.length + L.length;
  for (let i = 0; i < total; i++) {
    const wantWin = startWithWin ? (i % 2 === 0) : (i % 2 === 1);
    if (wantWin && wi < W.length) { out.push({ kind: 'win', v: W[wi++] }); }
    else if (!wantWin && li < L.length) { out.push({ kind: 'lost', v: L[li++] }); }
    else if (wi < W.length) { out.push({ kind: 'win', v: W[wi++] }); }
    else if (li < L.length) { out.push({ kind: 'lost', v: L[li++] }); }
  }
  return out;
}

/**
 * Replay button — re-plays the win or lose sound for the LAST result.
 * Honors the global mute toggle (getAudioCtx returns null when muted, so
 * tone() is a no-op). Designed to be inline next to the result banner.
 */
export function ReplayButton({ win, disabled }: { win: boolean; disabled?: boolean }) {
  const muted = isCasinoMuted();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (win ? playWinSound() : playLoseSound())}
      title={muted ? 'Audio muted — toggle the speaker icon to enable' : (win ? 'Replay win sound' : 'Replay lose sound')}
      className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all disabled:opacity-40 ${
        win
          ? 'border-wolf-gold/40 text-wolf-gold hover:bg-wolf-gold/10'
          : 'border-wolf-border/40 text-muted-foreground hover:bg-wolf-surface-hover'
      } ${muted ? 'opacity-60' : ''}`}
    >
      <span aria-hidden>{muted ? '🔇' : (win ? '🔊' : '🔉')}</span>
      <span>Replay {win ? 'win' : 'lose'} sound</span>
    </button>
  );
}

export function BetInput({
  bet, setBet, min, max, disabled, multiplier = 1, error,
}: {
  bet: string;
  setBet: (v: string) => void;
  min: string;
  max: string;
  disabled?: boolean;
  multiplier?: number;
  error?: string | null;
}) {
  // Apply UI floor: minimum bet is always >= 0.01 zkLTC, regardless of chain min.
  const minF = Math.max(parseFloat(min || '0') || 0, UI_MIN_BET_ZK);
  const maxF = parseFloat(max || '0') || 1;
  const UI_MIN = minF.toString();
  // Build presets from the effective floor so users always pick a valid amount.
  const fmtPreset = (v: number) => {
    const clamped = Math.min(Math.max(v, minF), maxF);
    // Trim trailing zeros, keep at most 4 decimals
    return clamped.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  };
  const presets = Array.from(new Set([
    fmtPreset(minF),
    fmtPreset(minF * 5),
    fmtPreset(minF * 25),
    fmtPreset(minF * 100),
  ])).slice(0, 4);
  let effective = bet;
  try { effective = ethers.utils.formatEther(ethers.utils.parseEther(bet || '0').mul(multiplier)); } catch { /* keep */ }
  const hasError = !!error;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Bet (zkLTC)</span>
        <span className="text-muted-foreground">
          min {minF.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} • max {maxF.toFixed(4)}
        </span>
      </div>
      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface border transition-colors ${
        hasError ? 'border-wolf-red/60 focus-within:border-wolf-red' : 'border-wolf-border/40 focus-within:border-wolf-pink/60'
      }`}>
        <input
          type="number" step="0.01" min={UI_MIN} max={max}
          value={bet} disabled={disabled}
          onChange={e => setBet(e.target.value)}
          className="bg-transparent outline-none flex-1 font-mono text-base"
        />
        <span className="text-xs text-wolf-gold font-semibold">zkLTC</span>
      </div>
      {multiplier > 1 && (
        <div className="text-[11px] text-muted-foreground flex items-center justify-between">
          <span>Effective bet (×{multiplier})</span>
          <span className="font-mono text-wolf-gold">{parseFloat(effective).toFixed(4)} zkLTC</span>
        </div>
      )}
      {hasError && (
        <div className="text-[11px] text-wolf-red font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-wolf-red" />
          {error}
        </div>
      )}
      <div className="flex gap-1.5">
        {presets.map(v => (
          <button
            key={v}
            disabled={disabled}
            onClick={() => setBet(v)}
            className="flex-1 text-[10px] py-1 rounded-md bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 hover:border-wolf-pink/40 uppercase tracking-wider transition-all disabled:opacity-50 font-mono"
          >
            {v}
          </button>
        ))}
        <button
          disabled={disabled || !max || max === '0'}
          onClick={() => setBet(String(maxF / Math.max(multiplier, 1)))}
          className="flex-1 text-[10px] py-1 rounded-md bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 hover:border-wolf-gold/40 uppercase tracking-wider transition-all disabled:opacity-50 font-bold text-wolf-gold"
        >
          MAX
        </button>
      </div>
    </div>
  );
}

/**
 * MultiplierPicker — 1x/2x/3x/4x/5x stake multiplier.
 * Purely UI: multiplies the base bet before sending to the contract.
 * Contract still validates against minBet/maxBet.
 */
export const BET_MULTIPLIERS = [1, 2, 3, 4, 5] as const;
export type BetMultiplier = typeof BET_MULTIPLIERS[number];

export function MultiplierPicker({
  value, onChange, disabled,
}: { value: BetMultiplier; onChange: (m: BetMultiplier) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2 mt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Stake multiplier</span>
        <span className="text-wolf-gold font-bold">×{value}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {BET_MULTIPLIERS.map(m => (
          <button
            key={m}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={`py-2 rounded-lg text-xs font-bold border-2 transition-all disabled:opacity-50 ${
              value === m
                ? 'border-wolf-gold bg-wolf-gold/15 text-wolf-gold shadow-[0_0_12px_oklch(0.78_0.16_85/40%)]'
                : 'border-wolf-border/30 bg-wolf-surface text-muted-foreground hover:border-wolf-gold/40'
            }`}
          >
            ×{m}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Multiply a decimal bet string by an integer multiplier, safely. */
export function applyMultiplier(bet: string, mult: BetMultiplier): string {
  try {
    const wei = ethers.utils.parseEther(bet || '0');
    const scaled = wei.mul(mult);
    return ethers.utils.formatEther(scaled);
  } catch {
    return bet;
  }
}

export function PlayButton({
  onClick, busy, label, disabled,
}: { onClick: () => void; busy: boolean; label: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="w-full mt-4 py-3 rounded-xl font-bold text-base relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'linear-gradient(135deg, oklch(0.65 0.25 330), oklch(0.78 0.16 85))',
        color: 'oklch(0.10 0.02 280)',
        boxShadow: '0 10px 30px -8px oklch(0.65 0.25 330 / 60%)',
      }}
    >
      {busy ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Settling on-chain…
        </span>
      ) : label}
    </button>
  );
}

export function ResultBanner({
  result,
}: { result: { win: boolean; payout: string; txHash: string; rewardToken?: TokenInfo } | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!result) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <AnimatePresence>
      {result && show && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`mt-3 p-3 rounded-xl text-center text-sm font-medium relative overflow-hidden ${
            result.win
              ? 'bg-gradient-to-r from-wolf-green/20 to-wolf-cyan/20 border border-wolf-green/40 text-wolf-green'
              : 'bg-wolf-surface border border-wolf-border/40 text-muted-foreground'
          }`}
        >
          {result.win ? (
            <div className="flex items-center justify-center gap-2 win-burst">
              {result.rewardToken && (
                <img src={result.rewardToken.logo} alt="" className="w-6 h-6 rounded-full ring-2 ring-wolf-gold/60" />
              )}
              <span className="text-wolf-gold font-extrabold text-base">+{parseFloat(result.payout).toFixed(4)} {CHAIN_CONFIG.symbol}</span>
              <span>WIN</span>
              {result.rewardToken && (
                <span className="text-xs text-muted-foreground">→ {result.rewardToken.symbol}</span>
              )}
            </div>
          ) : (
            <span>No win this round — try again 🐺</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Inline transaction panel — renders pending → confirmed/failed with a
 * link to the block explorer. Stays visible (no auto-dismiss) so users can
 * audit every play.
 */
export function TxPanel({
  txHash, status, payout, win,
}: {
  txHash: string | null;
  status: 'idle' | 'pending' | 'confirmed' | 'failed';
  payout?: string;
  win?: boolean;
}) {
  if (status === 'idle' || !txHash && status !== 'pending') return null;

  const dot = {
    pending:   'bg-wolf-gold animate-pulse',
    confirmed: win ? 'bg-wolf-green' : 'bg-wolf-pink',
    failed:    'bg-wolf-red',
    idle:      'bg-muted',
  }[status];

  const label = {
    pending:   'Submitting on-chain…',
    confirmed: win ? `Settled · WIN ${payout ? `+${parseFloat(payout).toFixed(4)} zkLTC` : ''}` : 'Settled · No win',
    failed:    'Transaction failed',
    idle:      '',
  }[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="mt-3 p-3 rounded-xl bg-wolf-surface/80 border border-wolf-border/40 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <span className="font-medium truncate">{label}</span>
        </div>
        {txHash ? (
          <a
            href={`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            className="text-wolf-pink hover:text-wolf-gold transition-colors font-mono shrink-0"
          >
            {txHash.slice(0, 8)}…{txHash.slice(-6)} ↗
          </a>
        ) : <span className="text-muted-foreground">—</span>}
      </div>
    </motion.div>
  );
}

/**
 * SwapTxPanel — renders the auto-swap transaction status (zkLTC payout →
 * reward token) so the user can verify that the wheel reward really landed
 * on-chain in the promised token, with a link to the block explorer.
 *
 * When `verifiedAmount` is provided, displays a green VERIFIED badge proving
 * the amount was decoded from a Transfer event in the swap receipt.
 */
export function SwapTxPanel({
  status, txHash, token, amount, verifiedAmount, expectedAmount,
}: {
  status: 'idle' | 'pending' | 'confirmed' | 'failed' | 'skipped';
  txHash: string | null;
  token?: TokenInfo | null;
  amount?: string;
  verifiedAmount?: string | null;
  expectedAmount?: number | null;
}) {
  if (status === 'idle' || status === 'skipped') return null;
  const dot = {
    pending:   'bg-wolf-gold animate-pulse',
    confirmed: 'bg-wolf-green',
    failed:    'bg-wolf-red',
  }[status as 'pending' | 'confirmed' | 'failed'];
  const label = {
    pending:   `Swapping payout → ${token?.symbol ?? 'token'}…`,
    confirmed: verifiedAmount
      ? `Reward delivered: ${parseFloat(verifiedAmount).toFixed(6)} ${token?.symbol ?? ''}`
      : `Reward delivered: ${amount ?? ''} ${token?.symbol ?? ''}`.trim(),
    failed:    `Swap to ${token?.symbol ?? 'token'} failed — kept as zkLTC`,
  }[status as 'pending' | 'confirmed' | 'failed'];

  // Compare verified vs expected reward — show match/mismatch badge
  const matchInfo = (() => {
    if (status !== 'confirmed' || !verifiedAmount || !expectedAmount) return null;
    const got = parseFloat(verifiedAmount);
    const want = expectedAmount;
    // Within 50% tolerance counts as a match (slippage from market price)
    const ratio = got / want;
    const matched = ratio >= 0.5 && ratio <= 2.0;
    return { matched, got, want, ratio };
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="mt-2 p-3 rounded-xl bg-wolf-surface/60 border border-wolf-gold/30 text-xs space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          {token && <img src={token.logo} alt="" className="w-4 h-4 rounded-full shrink-0" />}
          <span className="font-medium truncate text-wolf-gold">{label}</span>
          {status === 'confirmed' && verifiedAmount && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-wolf-green/20 border border-wolf-green/40 text-wolf-green text-[9px] font-black uppercase tracking-wider">
              ✓ verified
            </span>
          )}
        </div>
        {txHash ? (
          <a
            href={`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            className="text-wolf-pink hover:text-wolf-gold transition-colors font-mono shrink-0"
          >
            {txHash.slice(0, 8)}…{txHash.slice(-6)} ↗
          </a>
        ) : <span className="text-muted-foreground shrink-0">—</span>}
      </div>
      {matchInfo && (
        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-wolf-border/30">
          <span className="text-[10px] text-muted-foreground">Label vs received</span>
          <div className="flex items-center gap-1.5 text-[10px] font-mono">
            <span className="text-muted-foreground">label {matchInfo.want}</span>
            <span className="text-muted-foreground">→</span>
            <span className={matchInfo.matched ? 'text-wolf-green font-bold' : 'text-wolf-gold font-bold'}>
              got {matchInfo.got.toFixed(6)}
            </span>
            <span className={`px-1 py-0.5 rounded text-[9px] font-black ${matchInfo.matched ? 'bg-wolf-green/20 text-wolf-green' : 'bg-wolf-gold/20 text-wolf-gold'}`}>
              {matchInfo.matched ? 'MATCH' : `${(matchInfo.ratio * 100).toFixed(0)}%`}
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * ZebraExplainerPanel — explains the deterministic WIN/LOST zebra interleave
 * pattern used per spin, showing the on-chain seed (tx hash + result bytes)
 * the layout was derived from. Helps users audit fairness: same seed always
 * produces the same alternation pattern.
 */
export function ZebraExplainerPanel({
  seedSource, txHash, totalSlots, winSlots, lostSlots,
}: {
  seedSource: 'preview' | 'on-chain';
  txHash?: string | null;
  totalSlots: number;
  winSlots: number;
  lostSlots: number;
}) {
  // Build a tiny pattern preview (first 8 of the alternation)
  const sample = Array.from({ length: Math.min(totalSlots, 12) }, (_, i) => i % 2 === 0 ? 'W' : 'L');
  return (
    <div className="mt-3 p-3 rounded-xl bg-wolf-surface/40 border border-wolf-border/30 text-[11px] space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-bold text-wolf-cyan uppercase tracking-wider text-[10px]">Zebra fairness</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
          seedSource === 'on-chain' ? 'bg-wolf-green/20 text-wolf-green border border-wolf-green/40' : 'bg-wolf-border/30 text-muted-foreground border border-wolf-border/40'
        }`}>
          {seedSource === 'on-chain' ? '✓ On-chain seed' : 'Preview'}
        </span>
      </div>
      <p className="text-muted-foreground leading-relaxed">
        Slots strictly alternate <span className="text-wolf-gold font-bold">WIN</span> ↔ <span className="text-wolf-red font-bold">LOST</span> so two losses never sit side-by-side.
        Token order inside the WIN group is shuffled by a seed derived from the {seedSource === 'on-chain' ? 'transaction hash + result bytes' : 'preview RNG (will reseed once tx confirms)'}.
      </p>
      <div className="flex items-center gap-1 flex-wrap">
        {sample.map((s, i) => (
          <span key={i} className={`w-5 h-5 rounded flex items-center justify-center text-[8px] font-black ${
            s === 'W' ? 'bg-wolf-gold/30 text-wolf-gold border border-wolf-gold/50' : 'bg-wolf-red/20 text-wolf-red border border-wolf-red/40'
          }`}>
            {s}
          </span>
        ))}
        {totalSlots > 12 && <span className="text-muted-foreground">…</span>}
      </div>
      <div className="flex items-center justify-between pt-1 border-t border-wolf-border/30">
        <span className="text-muted-foreground">
          {winSlots} WIN • {lostSlots} LOST • {totalSlots} total
        </span>
        {txHash ? (
          <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`} target="_blank" rel="noreferrer"
             className="font-mono text-wolf-pink hover:text-wolf-gold transition-colors">
            seed {txHash.slice(0, 10)}… ↗
          </a>
        ) : (
          <span className="font-mono text-muted-foreground">seed —</span>
        )}
      </div>
    </div>
  );
}

// (TxStatus exported earlier in this module)

/**
 * PendingOverlay — premium animated skeleton shown ON TOP of a game's
 * animation stage while the tx is in flight or while resultBytes are being
 * decoded. Never blocks the underlying animation: it sits above with
 * `pointer-events: none` and a subtle shimmer + orbiting particles + spinner.
 *
 * Use `active` to drive visibility — keep it true while status === 'pending'
 * AND while the post-confirmation animation timeline is still running.
 *
 * Variants:
 *  - 'shimmer' (default): full-stage glassy shimmer + 3 orbiting orbs
 *  - 'orbit'   : minimal — just the orbiting orbs + spinner pill
 */
export function PendingOverlay({
  active,
  label = 'Settling on-chain…',
  variant = 'shimmer',
}: {
  active: boolean;
  label?: string;
  variant?: 'shimmer' | 'orbit';
}) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center rounded-2xl overflow-hidden"
        >
          {variant === 'shimmer' && <div className="absolute inset-0 casino-pending-shimmer" aria-hidden />}
          <div className="absolute inset-0 casino-pending-orbits" aria-hidden>
            <span className="casino-orb casino-orb-1" />
            <span className="casino-orb casino-orb-2" />
            <span className="casino-orb casino-orb-3" />
          </div>
          <motion.div
            initial={{ y: 8, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            className="relative z-10 flex items-center gap-2 px-4 py-2 rounded-full bg-wolf-surface/85 backdrop-blur-md border border-wolf-gold/40 text-xs font-semibold shadow-2xl"
          >
            <span className="w-3 h-3 rounded-full border-2 border-wolf-gold border-t-transparent animate-spin" />
            <span className="bg-gradient-to-r from-wolf-gold via-wolf-pink to-wolf-gold bg-clip-text text-transparent bg-[length:200%_100%] casino-text-shimmer">
              {label}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Confetti({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<Array<{ x: number; color: string; delay: number }>>([]);
  useEffect(() => {
    if (!trigger) return;
    const colors = ['#f0b429', '#e040a0', '#3ee6c4', '#60a5fa', '#a855f7'];
    setPieces(
      Array.from({ length: 60 }).map(() => ({
        x: Math.random() * 100,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.6,
      }))
    );
    const t = setTimeout(() => setPieces([]), 3500);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!pieces.length) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[100]">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            top: 0,
            width: 8, height: 14,
            background: p.color,
            borderRadius: 2,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
