import { useState, useMemo, useEffect, useRef } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, tonePeg, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

const ROWS = 9;
const SLOTS = 10;
const MULTS = [10, 5, 2, 1, 0.5, 0.5, 1, 2, 5, 10];
const BOARD_W = 100;
const BOARD_H = 380;
const PEG_SPACING_X = BOARD_W / (SLOTS + 1);
const PEG_SPACING_Y = 32;
const TOP_OFFSET = 30;

export default function PlinkoGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [ballKey, setBallKey] = useState(0);
  const [path, setPath] = useState<{ x: number; y: number }[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confetti, setConfetti] = useState(0);
  const [tx, setTx] = useState<{ hash: string | null; status: TxStatus }>({ hash: null, status: 'idle' });
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [shocks, setShocks] = useState<{ id: number; x: number; y: number }[]>([]);
  const shockSeq = useRef(0);

  useEffect(() => {
    if (!bet && parseFloat(casino.stats.minBet) > 0) setBet(casino.stats.minBet);
  }, [casino.stats.minBet, bet]);

  const betError = getBetError(bet, mult, casino.stats.minBet, casino.stats.maxBet);

  // Pegs arranged as triangle: row r has (r+2) pegs.
  // Bell-curve drop: ball starts at the top-center peg, then for each row
  // it bounces left or right with a slight bias toward the centre. We map
  // the on-chain result byte to a deterministic L/R sequence so the path
  // both ends in the slot the contract picked AND looks physically real.
  const pegs = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const cols = r + 2;
      for (let c = 0; c < cols; c++) {
        out.push({
          x: 50 + (c - (cols - 1) / 2) * PEG_SPACING_X,
          y: TOP_OFFSET + r * PEG_SPACING_Y,
        });
      }
    }
    return out;
  }, []);

  /**
   * Build a physical bounce path from row 0 → final slot.
   * Each step is a parabolic arc between two pegs. The deterministic L/R
   * sequence is built by walking BACKWARD from the target slot so the
   * sum of (rights - lefts) lands exactly on the chosen slot index.
   */
  const buildPath = (slot: number): { x: number; y: number }[] => {
    // After ROWS rows, ball can land in SLOTS bins (0..ROWS).
    // We generate a sequence of R/L moves whose count of R equals `slot`.
    const rights = Math.max(0, Math.min(slot, ROWS));
    const moves: ('L' | 'R')[] = [];
    for (let i = 0; i < ROWS; i++) moves.push(i < rights ? 'R' : 'L');
    // Shuffle deterministically by slot so it doesn't always look like RRRLLL
    const seed = slot * 9301 + 49297;
    let s = seed;
    for (let i = moves.length - 1; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    const pts: { x: number; y: number }[] = [{ x: 50, y: 0 }];
    let x = 50;
    for (let r = 0; r < ROWS; r++) {
      x += moves[r] === 'R' ? PEG_SPACING_X / 2 : -PEG_SPACING_X / 2;
      pts.push({ x, y: TOP_OFFSET + r * PEG_SPACING_Y });
    }
    // Final drop into slot
    const finalX = (slot - (SLOTS - 1) / 2) * PEG_SPACING_X + 50;
    pts.push({ x: finalX, y: BOARD_H - 24 });
    return pts;
  };

  // Inject a unique @keyframes for each drop so the ball animates through
  // every waypoint precisely.
  useEffect(() => {
    if (!styleRef.current) {
      const el = document.createElement('style');
      el.id = 'plinko-dynamic-keyframes';
      document.head.appendChild(el);
      styleRef.current = el;
    }
    if (path.length === 0) return;
    const stops = path.map((p, i) => {
      const pct = (i / (path.length - 1)) * 100;
      const xPx = ((p.x - 50) / 100) * 300;
      const yPx = (p.y / BOARD_H) * 380;
      // Squash on impact (every other waypoint)
      const sy = i > 0 && i < path.length - 1 ? (i % 2 === 0 ? 0.85 : 1.05) : 1;
      const sx = i > 0 && i < path.length - 1 ? (i % 2 === 0 ? 1.15 : 0.95) : 1;
      const rot = (i % 2 === 0 ? 1 : -1) * 35 * i;
      return `${pct.toFixed(2)}% { transform: translate3d(${xPx.toFixed(2)}px, ${yPx.toFixed(2)}px, 0) rotate(${rot}deg) scale(${sx.toFixed(2)}, ${sy.toFixed(2)}); }`;
    }).join('\n');
    styleRef.current.textContent = `@keyframes plinkoPath${ballKey} { ${stops} }`;
  }, [path, ballKey]);

  const play = async () => {
    if (!wallet.isConnected) return toast.error('Connect wallet first');
    if (betError) return toast.error(betError);
    setResult(null); setActiveSlot(null);
    playSpinSound();
    setTx({ hash: null, status: 'pending' });
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playPlinko(finalBet);
      const raw = decodeByte(r.resultBytes, 0);
      const lastByte = raw !== null ? raw % SLOTS : (r.win ? 0 : Math.floor(SLOTS / 2));
      setPath(buildPath(lastByte));
      setBallKey(k => k + 1);
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'Plinko', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      // Schedule peg-hit shockwaves so the visual "ping" syncs with the
      // ball's bounce timeline (2.4s total animation, ROWS bounces).
      const total = 2400;
      const pathPts = buildPath(lastByte);
      pathPts.forEach((p, i) => {
        if (i === 0 || i === pathPts.length - 1) return;
        const at = (i / (pathPts.length - 1)) * total;
        setTimeout(() => {
          const id = ++shockSeq.current;
          setShocks(prev => [...prev, { id, x: p.x, y: p.y }]);
          tonePeg();
          setTimeout(() => setShocks(prev => prev.filter(s => s.id !== id)), 600);
        }, at);
      });
      setTimeout(() => {
        setActiveSlot(lastByte);
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({ game: 'Plinko', win: r.win, payout: r.payout, txHash: r.txHash , txStatus: 'confirmed' });
        if (r.win) setConfetti(c => c + 1);
      }, 2600);
    } catch (e: any) {
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Plinko" subtitle="Drop the ball, land on a high multiplier" icon="🎯" accent="cyan">
      <Confetti trigger={confetti} />
      <div
        className="plinko-board rounded-2xl p-4 relative overflow-hidden"
        style={{ height: 460 }}
      >
        {/* depth gradient floor */}
        <div className="absolute inset-0 pointer-events-none plinko-depth" />
        <div className="plinko-catch-glow" />
        <svg viewBox={`0 0 100 ${BOARD_H}`} className="w-full h-full overflow-visible relative" style={{ height: 380 }}>
          <defs>
            <radialGradient id="pegGrad" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="oklch(1 0 0)" />
              <stop offset="40%" stopColor="oklch(0.85 0.18 85)" />
              <stop offset="100%" stopColor="oklch(0.45 0.20 30)" />
            </radialGradient>
            <filter id="pegGlow">
              <feGaussianBlur stdDeviation="0.6" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {pegs.map((p, i) => (
            <g key={i} filter="url(#pegGlow)">
              <circle cx={p.x} cy={p.y + 0.4} r={1.4} fill="oklch(0 0 0 / 50%)" />
              <circle cx={p.x} cy={p.y} r={1.4} fill="url(#pegGrad)" />
              <circle cx={p.x - 0.4} cy={p.y - 0.4} r={0.4} fill="oklch(1 0 0 / 70%)" />
            </g>
          ))}
        </svg>

        {/* Peg-hit shockwaves */}
        {shocks.map(s => (
          <span
            key={s.id}
            className="plinko-shock"
            style={{
              left:  `${s.x}%`,
              top:   `${(s.y / BOARD_H) * 380 + 16}px`,
            }}
          />
        ))}

        {/* The ball — uses a per-drop @keyframes so it bounces peg-to-peg */}
        {ballKey > 0 && (
          <div
            key={ballKey}
            className="plinko-ball-3d absolute"
            style={{
              width: 22, height: 22,
              left: 'calc(50% - 11px)', top: 4,
              animation: `plinkoPath${ballKey} 2.4s cubic-bezier(.55,.08,.68,.53) forwards`,
            }}
          >
            <span className="plinko-trail" />
          </div>
        )}

        {/* Multiplier slots */}
        <div className="absolute bottom-0 left-0 right-0 grid grid-cols-10 gap-0.5 px-1">
          {MULTS.map((m, i) => {
            const isActive = activeSlot === i;
            const tier =
              m >= 5 ? 'plinko-slot-pink' :
              m >= 2 ? 'plinko-slot-gold' :
              m >= 1 ? 'plinko-slot-cyan' :
                       'plinko-slot-mute';
            return (
              <div
                key={i}
                className={`plinko-slot ${tier} ${isActive ? 'plinko-slot-hit' : ''}`}
              >
                ×{m}
              </div>
            );
          })}
        </div>

        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && !result && ballKey > 0)} label="Dropping ball on-chain…" />
      </div>
      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Drop for ${applyMultiplier(bet, mult)} zkLTC`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
    </GameShell>
  );
}
