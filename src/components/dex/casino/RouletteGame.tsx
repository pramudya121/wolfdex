import { effectiveMinBet, useState, useEffect } from 'react';
import { effectiveMinBet, useDexContext } from '@/context/DexContext';
import { effectiveMinBet, useCasino } from '@/hooks/useCasino';
import { effectiveMinBet, useCasinoHistory } from '@/hooks/useCasinoHistory';
import { effectiveMinBet, GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

const NUMBERS = Array.from({ length: 37 }, (_, i) => i);
const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export default function RouletteGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [pick, setPick] = useState(0);
  const [angle, setAngle] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [confetti, setConfetti] = useState(0);
  const [tx, setTx] = useState<{ hash: string | null; status: TxStatus }>({ hash: null, status: 'idle' });

  useEffect(() => {
    if (!bet && parseFloat(casino.stats.minBet) > 0) setBet(effectiveMinBet(casino.stats.minBet));
  }, [casino.stats.minBet, bet]);

  const betError = getBetError(bet, mult, casino.stats.minBet, casino.stats.maxBet);
  const segAngle = 360 / 37;

  const play = async () => {
    if (!wallet.isConnected) return toast.error('Connect wallet first');
    if (betError) return toast.error(betError);
    setResult(null);
    playSpinSound();
    setTx({ hash: null, status: 'pending' });
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playRoulette(pick, finalBet);
      const raw = decodeByte(r.resultBytes, 0);
      const byte = raw !== null
        ? raw % 37
        : (r.win ? pick : (pick + 1) % 37);
      const target = 360 * 6 + (360 - byte * segAngle) - segAngle / 2;
      setAngle(prev => prev + (target - (prev % 360)));
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'Roulette', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      setTimeout(() => {
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({
          game: 'Roulette', win: r.win, payout: r.payout, txHash: r.txHash,
          rewardLabel: `Ball: ${byte}`,
          txStatus: 'confirmed',
        });
        if (r.win) setConfetti(c => c + 1);
      }, 4100);
    } catch (e: any) {
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Roulette" subtitle="Hit your number → 35× payout" icon="🎡" accent="pink">
      <Confetti trigger={confetti} />
      <div className="casino-felt rounded-2xl p-6 flex items-center justify-center min-h-[280px] relative">
        <div className="relative" style={{ width: 240, height: 240 }}>
          <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-20 pointer-pulse">
            <svg width="20" height="24" viewBox="0 0 20 24"><path d="M10 24 L0 0 L20 0 Z" fill="oklch(0.78 0.16 85)" /></svg>
          </div>
          <div
            className="roulette-wheel absolute inset-0 rounded-full border-4 border-wolf-gold"
            style={{ transform: `rotate(${angle}deg)`, boxShadow: '0 0 60px oklch(0.65 0.25 330 / 50%), inset 0 0 30px oklch(0 0 0 / 80%)' }}
          >
            {NUMBERS.map(n => {
              const a = n * segAngle;
              const color = n === 0 ? 'oklch(0.45 0.18 150)' : RED.has(n) ? 'oklch(0.55 0.25 25)' : 'oklch(0.15 0.02 280)';
              return (
                <div
                  key={n}
                  className="absolute left-1/2 top-1/2 origin-bottom"
                  style={{
                    width: 22, height: 110,
                    marginLeft: -11, marginTop: -110,
                    transform: `rotate(${a}deg)`,
                    background: color,
                    clipPath: 'polygon(45% 0%, 55% 0%, 100% 100%, 0% 100%)',
                  }}
                >
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white">{n}</span>
                </div>
              );
            })}
            <div className="absolute inset-[35%] rounded-full bg-gradient-to-br from-wolf-gold to-wolf-red flex items-center justify-center text-2xl">🐺</div>
          </div>
        </div>
        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && !result)} label="Spinning the wheel…" />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Pick a number (0-36)</span>
          <span className={`font-bold text-lg ${pick === 0 ? 'text-wolf-green' : RED.has(pick) ? 'text-wolf-red' : 'text-foreground'}`}>{pick}</span>
        </div>
        <input type="range" min={0} max={36} value={pick} onChange={e => setPick(Number(e.target.value))}
          disabled={!!casino.busy} className="w-full accent-wolf-pink" />
      </div>

      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Spin ${applyMultiplier(bet, mult)} zkLTC · pick ${pick}`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
    </GameShell>
  );
}
