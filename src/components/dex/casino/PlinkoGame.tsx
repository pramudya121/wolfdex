import { useState, useMemo, useEffect, useRef } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, tonePeg, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

// --- Pyramid configuration (matches reference image) ---
const ROWS = 16;
const SLOTS = ROWS + 1; // 17
// Symmetric multipliers ramping from edges → center
// Edges = high (1000×, 130×, 26×…), center ~ 0.2–0.5×
const MULTS: number[] = [
  1000, 130, 26, 9, 4, 2, 1.5, 1, 0.5, 1, 1.5, 2, 4, 9, 26, 130, 1000,
];
const BOARD_W = 100;       // viewBox width (%)
const BOARD_H = 520;       // viewBox height (px)
const PEG_SPACING_X = (BOARD_W * 0.86) / (SLOTS - 1); // tighter pyramid
const PEG_SPACING_Y = 26;
const TOP_OFFSET = 24;

function tierFor(m: number) {
  if (m >= 100) return 'plinko-slot-red';
  if (m >= 10)  return 'plinko-slot-orange';
  if (m >= 2)   return 'plinko-slot-amber';
  if (m >= 1)   return 'plinko-slot-gold';
  return 'plinko-slot-mute';
}

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

  // Build a perfect pyramid: row r (0..ROWS-1) has (r+2) pegs, centered.
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
   * Build a physical bounce path that ends exactly on `slot`.
   * Walks ROWS rows; each step is L or R. Number of R = slot index.
   */
  const buildPath = (slot: number): { x: number; y: number }[] => {
    const rights = Math.max(0, Math.min(slot, ROWS));
    const moves: ('L' | 'R')[] = [];
    for (let i = 0; i < ROWS; i++) moves.push(i < rights ? 'R' : 'L');
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
    const finalX = (slot - (SLOTS - 1) / 2) * PEG_SPACING_X + 50;
    pts.push({ x: finalX, y: BOARD_H - 30 });
    return pts;
  };

  // Inject per-drop @keyframes — converts viewBox coords → pixel transforms.
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
      const xPx = ((p.x - 50) / 100) * 460; // board pixel width approx
      const yPx = (p.y / BOARD_H) * 480;
      const sy = i > 0 && i < path.length - 1 ? (i % 2 === 0 ? 0.82 : 1.08) : 1;
      const sx = i > 0 && i < path.length - 1 ? (i % 2 === 0 ? 1.18 : 0.92) : 1;
      const rot = (i % 2 === 0 ? 1 : -1) * 28 * i;
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
      const total = 3000;
      const pathPts = buildPath(lastByte);
      pathPts.forEach((p, i) => {
        if (i === 0 || i === pathPts.length - 1) return;
        const at = (i / (pathPts.length - 1)) * total;
        setTimeout(() => {
          const id = ++shockSeq.current;
          setShocks(prev => [...prev, { id, x: p.x, y: p.y }]);
          tonePeg();
          setTimeout(() => setShocks(prev => prev.filter(s => s.id !== id)), 700);
        }, at);
      });
      setTimeout(() => {
        setActiveSlot(lastByte);
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({ game: 'Plinko', win: r.win, payout: r.payout, txHash: r.txHash , txStatus: 'confirmed' });
        if (r.win) setConfetti(c => c + 1);
      }, 3200);
    } catch (e: any) {
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Plinko" subtitle="Drop the ball — edges pay 1000× big" icon="🎯" accent="cyan">
      <Confetti trigger={confetti} />
      <div className="plinko-board-v2 rounded-2xl p-3 relative overflow-hidden" style={{ height: 580 }}>
        {/* deep ambient gradient */}
        <div className="absolute inset-0 pointer-events-none plinko-depth-v2" />
        <div className="plinko-board-glow" />
        <svg viewBox={`0 0 100 ${BOARD_H}`} preserveAspectRatio="xMidYMid meet" className="w-full overflow-visible relative" style={{ height: 480 }}>
          <defs>
            <radialGradient id="pegGradV2" cx="35%" cy="30%" r="65%">
              <stop offset="0%" stopColor="oklch(1 0 0)" />
              <stop offset="35%" stopColor="oklch(0.95 0.06 230)" />
              <stop offset="100%" stopColor="oklch(0.55 0.10 250)" />
            </radialGradient>
            <filter id="pegGlowV2">
              <feGaussianBlur stdDeviation="0.5" result="b" />
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {pegs.map((p, i) => (
            <g key={i} filter="url(#pegGlowV2)">
              <circle cx={p.x} cy={p.y + 0.35} r={1.05} fill="oklch(0 0 0 / 50%)" />
              <circle cx={p.x} cy={p.y} r={1.05} fill="url(#pegGradV2)" />
              <circle cx={p.x - 0.3} cy={p.y - 0.3} r={0.32} fill="oklch(1 0 0 / 75%)" />
            </g>
          ))}
        </svg>

        {/* shockwaves */}
        {shocks.map(s => (
          <span
            key={s.id}
            className="plinko-shock"
            style={{ left: `${s.x}%`, top: `${(s.y / BOARD_H) * 480 + 12}px` }}
          />
        ))}

        {/* the ball */}
        {ballKey > 0 && (
          <div
            key={ballKey}
            className="plinko-ball-3d absolute"
            style={{
              width: 18, height: 18,
              left: 'calc(50% - 9px)', top: 6,
              animation: `plinkoPath${ballKey} 3s cubic-bezier(.55,.08,.68,.53) forwards`,
            }}
          >
            <span className="plinko-trail" />
          </div>
        )}

        {/* multiplier slots — bottom row */}
        <div className="absolute bottom-0 left-0 right-0 px-2 pb-2">
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${SLOTS}, minmax(0,1fr))` }}>
            {MULTS.map((m, i) => {
              const isActive = activeSlot === i;
              return (
                <div key={i} className={`plinko-slot-v2 ${tierFor(m)} ${isActive ? 'plinko-slot-hit' : ''}`}>
                  {m >= 1 ? `${m}×` : `${m}×`}
                </div>
              );
            })}
          </div>
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
