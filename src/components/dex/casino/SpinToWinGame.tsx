import { useState, useEffect, useMemo } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { effectiveMinBet,
  GameShell, BetInput, PlayButton, ResultBanner, Confetti,
  REEL_TOKENS, TxPanel, SwapTxPanel, ZebraExplainerPanel, PendingOverlay, decodeByte, autoSwapPayout,
  MultiplierPicker, applyMultiplier, getBetError, friendlyError,
  notifyResult, playSpinSound, rewardLabelFor, realizedRewardLabel,
  WHEEL_REWARD_AMOUNT, ReplayButton, seedFromOnChain, zebraInterleave,
  type BetMultiplier, type TxStatus,
} from './casinoShared';
import { toast } from 'sonner';
import { type TokenInfo } from '@/config/contracts';

type Slot =
  | { kind: 'win'; token: TokenInfo; reward: number }
  | { kind: 'lost' };

/** Build segments: ALL reward tokens + equal LOST count, ZEBRA-interleaved
 *  so wins and losses always alternate visually. */
function buildSlots(seed: number): Slot[] {
  const tokens = Object.keys(WHEEL_REWARD_AMOUNT)
    .map(s => REEL_TOKENS.find(t => t.symbol === s))
    .filter((t): t is TokenInfo => !!t);
  const wins = tokens.map(t => ({ token: t, reward: WHEEL_REWARD_AMOUNT[t.symbol] ?? 0.1 }));
  const losts = tokens.map((_, i) => i);
  const interleaved = zebraInterleave(wins, losts, seed);
  return interleaved.map(s =>
    s.kind === 'win'
      ? { kind: 'win' as const, token: s.v.token, reward: s.v.reward }
      : { kind: 'lost' as const }
  );
}

export default function SpinToWinGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();

  const [shuffleSeed, setShuffleSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const SLOTS = useMemo(() => buildSlots(shuffleSeed), [shuffleSeed]);
  const segAngle = 360 / SLOTS.length;

  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<{ win: boolean; payout: string; txHash: string; rewardToken?: TokenInfo; landedIdx?: number } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [tx, setTx] = useState<{ hash: string | null; status: TxStatus }>({ hash: null, status: 'idle' });
  const [swapTx, setSwapTx] = useState<{ hash: string | null; status: 'idle' | 'pending' | 'confirmed' | 'failed' | 'skipped'; token?: TokenInfo | null; amount?: string; verifiedAmount?: string | null; expectedAmount?: number | null }>({ hash: null, status: 'idle' });

  useEffect(() => {
    if (!bet && parseFloat(casino.stats.minBet) > 0) setBet(effectiveMinBet(casino.stats.minBet));
  }, [casino.stats.minBet, bet]);

  const betError = getBetError(bet, mult, casino.stats.minBet, casino.stats.maxBet);

  const play = async () => {
    if (!wallet.isConnected) return toast.error('Connect wallet first');
    if (betError) return toast.error(betError);
    setResult(null);
    setTx({ hash: null, status: 'pending' });
    setSwapTx({ hash: null, status: 'idle' });
    playSpinSound();
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playSpinToWin(finalBet);

      // Reseed layout from on-chain randomness so the displayed wheel matches
      // the entropy that produced the result.
      const onChainSeed = seedFromOnChain(r.txHash, r.resultBytes);
      const newSlots = buildSlots(onChainSeed);

      const raw = decodeByte(r.resultBytes, 0);
      const byte = raw !== null
        ? raw % newSlots.length
        : (r.win ? newSlots.findIndex(s => s.kind === 'win') : newSlots.findIndex(s => s.kind === 'lost'));
      const target = 360 * 7 + (360 - byte * segAngle) - segAngle / 2;

      setShuffleSeed(onChainSeed);
      setAngle(prev => prev + (target - (prev % 360)));
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'SpinToWin', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });

      setTimeout(() => {
        const landed = newSlots[byte];
        const landedToken = landed?.kind === 'win' ? landed.token : undefined;
        const rewardLabel = landed?.kind === 'win' && landedToken
          ? realizedRewardLabel(r.payout, landedToken.symbol)
          : 'LOST';
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash, rewardToken: landedToken, landedIdx: byte });
        notifyResult({
          game: 'Spin to Win', win: r.win, payout: r.payout,
          rewardLabel, txHash: r.txHash, txStatus: 'confirmed',
        });
        if (r.win && landedToken) {
          setConfetti(c => c + 1);
          const expected = WHEEL_REWARD_AMOUNT[landedToken.symbol] ?? null;
          setSwapTx({ hash: null, status: 'pending', token: landedToken, expectedAmount: expected });
          autoSwapPayout(wallet.signer, wallet.address, landedToken, r.payoutWei).then(swap => {
            if (swap.status === 'confirmed') {
              setSwapTx({
                hash: swap.txHash, status: 'confirmed', token: landedToken,
                amount: realizedRewardLabel(r.payout, landedToken.symbol),
                verifiedAmount: swap.received,
                expectedAmount: expected,
              });
            } else if (swap.status === 'failed') {
              setSwapTx(prev => ({ ...prev, status: 'failed' }));
            } else {
              setSwapTx(prev => ({ ...prev, status: 'skipped' }));
            }
          });
        }
      }, 4200);
    } catch (e: any) {
      // notifyResult is gated on confirmed; failed tx → only the friendly error.
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Spin to Win" subtitle={`${SLOTS.filter(s=>s.kind==='win').length} token rewards + ${SLOTS.filter(s=>s.kind==='lost').length} LOST — layout reseeded from on-chain randomness`} icon="✨" accent="cyan">
      <Confetti trigger={confetti} />
      <div className="casino-felt rounded-2xl p-6 flex items-center justify-center min-h-[320px] relative">
        <div className="relative" style={{ width: SLOTS.length > 8 ? 340 : 280, height: SLOTS.length > 8 ? 340 : 280 }}>
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-20 pointer-pulse">
            <svg width="26" height="32" viewBox="0 0 20 24"><path d="M10 24 L0 0 L20 0 Z" fill="oklch(0.65 0.25 330)" /></svg>
          </div>
          <div
            className="roulette-wheel absolute inset-0 rounded-full border-4 transition-transform duration-[4200ms] ease-out"
            style={{
              transform: `rotate(${angle}deg)`,
              borderColor: 'oklch(0.65 0.25 330)',
              boxShadow: '0 0 80px oklch(0.65 0.25 330 / 60%), inset 0 0 40px oklch(0 0 0 / 60%)',
            }}
          >
            <svg viewBox="-100 -100 200 200" className="absolute inset-0 w-full h-full">
              {SLOTS.map((slot, i) => {
                const a1 = (i * segAngle - 90) * Math.PI / 180;
                const a2 = ((i + 1) * segAngle - 90) * Math.PI / 180;
                const x1 = Math.cos(a1) * 100, y1 = Math.sin(a1) * 100;
                const x2 = Math.cos(a2) * 100, y2 = Math.sin(a2) * 100;
                const fill = slot.kind === 'lost'
                  ? 'oklch(0.18 0.04 15)'
                  : (i % 2 === 0 ? 'oklch(0.55 0.25 25)' : 'oklch(0.65 0.20 280)');
                return (
                  <path key={i} d={`M0 0 L${x1} ${y1} A100 100 0 0 1 ${x2} ${y2} Z`}
                    fill={fill} stroke="oklch(0.10 0 0)" strokeWidth={1} />
                );
              })}
            </svg>
            {SLOTS.map((slot, i) => {
              const a = i * segAngle + segAngle / 2;
              const radius = SLOTS.length > 8 ? 80 : 72;
              const size = SLOTS.length > 8 ? 36 : 52;
              const half = size / 2;
              const x = Math.cos((a - 90) * Math.PI / 180) * radius;
              const y = Math.sin((a - 90) * Math.PI / 180) * radius;
              return (
                <div
                  key={i}
                  className="absolute flex flex-col items-center justify-center"
                  style={{
                    left: `calc(50% + ${x}px - ${half}px)`,
                    top: `calc(50% + ${y}px - ${half}px)`,
                    width: size, height: size,
                    transform: `rotate(${a}deg)`,
                  }}
                >
                  {slot.kind === 'win' ? (
                    <>
                      <img src={slot.token.logo} alt={slot.token.symbol}
                        className={`${SLOTS.length > 8 ? 'w-5 h-5' : 'w-9 h-9'} rounded-full ring-2 ring-white/40 shadow-xl`} />
                      <span className={`${SLOTS.length > 8 ? 'text-[7px]' : 'text-[8px]'} font-bold mt-0.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] leading-none`}>
                        {slot.reward < 0.001 ? slot.reward.toExponential(0) : slot.reward}
                      </span>
                    </>
                  ) : (
                    <span className={`${SLOTS.length > 8 ? 'text-[8px]' : 'text-[11px]'} font-black text-wolf-red drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] tracking-wider`}>
                      LOST
                    </span>
                  )}
                </div>
              );
            })}
            <div className="absolute inset-[38%] rounded-full bg-gradient-to-br from-wolf-pink to-wolf-purple flex items-center justify-center text-3xl">✨</div>
          </div>
        </div>
        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && !result)} label="Tap-spin in flight…" />
      </div>

      <p className="text-xs text-center text-muted-foreground mt-3">
        Half the wheel is <span className="text-wolf-red font-bold">LOST</span> — land on a token and the matching reward is paid out (auto-swapped).
      </p>

      {/* Active Board panel — 4 rewards + 4 LOST with realized status */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Board</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            seed {tx.status === 'confirmed' && tx.hash ? `${tx.hash.slice(0, 10)}…` : 'preview'}
          </span>
        </div>
        <div className={`grid gap-1.5 ${SLOTS.length > 8 ? 'grid-cols-4 sm:grid-cols-8' : 'grid-cols-4'}`}>
          {SLOTS.map((slot, i) => {
            const isLanded = result?.landedIdx === i;
            return (
              <div key={i} className={`p-1.5 rounded-md border text-center text-[10px] relative ${
                isLanded
                  ? (result?.win ? 'border-wolf-green bg-wolf-green/15 ring-2 ring-wolf-green/40' : 'border-wolf-red bg-wolf-red/15 ring-2 ring-wolf-red/40')
                  : slot.kind === 'lost'
                    ? 'border-wolf-red/30 bg-wolf-red/5'
                    : 'border-wolf-gold/30 bg-wolf-gold/5'
              }`}>
                {isLanded && (
                  <span className={`absolute -top-1.5 -right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full ${result?.win ? 'bg-wolf-green text-black' : 'bg-wolf-red text-white'}`}>
                    {result?.win ? 'WIN' : 'LOST'}
                  </span>
                )}
                {slot.kind === 'win' ? (
                  <>
                    <img src={slot.token.logo} alt="" className="w-5 h-5 mx-auto rounded-full" />
                    <div className="font-mono mt-0.5">{slot.reward < 0.001 ? slot.reward.toExponential(0) : slot.reward}</div>
                    <div className="text-wolf-gold font-bold">{slot.token.symbol}</div>
                  </>
                ) : (
                  <>
                    <div className="w-5 h-5 mx-auto">💀</div>
                    <div className="text-wolf-red font-bold mt-0.5">LOST</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Spin for ${applyMultiplier(bet, mult)} zkLTC`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
      <SwapTxPanel
        status={swapTx.status}
        txHash={swapTx.hash}
        token={swapTx.token}
        amount={swapTx.amount}
        verifiedAmount={swapTx.verifiedAmount}
        expectedAmount={swapTx.expectedAmount}
      />
      <ZebraExplainerPanel
        seedSource={tx.status === 'confirmed' ? 'on-chain' : 'preview'}
        txHash={tx.hash}
        totalSlots={SLOTS.length}
        winSlots={SLOTS.filter(s => s.kind === 'win').length}
        lostSlots={SLOTS.filter(s => s.kind === 'lost').length}
      />
    </GameShell>
  );
}
