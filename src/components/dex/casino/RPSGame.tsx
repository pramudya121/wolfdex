import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

const MOVES = ['✊', '✋', '✌️'] as const;
const NAMES = ['Rock', 'Paper', 'Scissors'] as const;

export default function RPSGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [pick, setPick] = useState<0 | 1 | 2>(0);
  const [shake, setShake] = useState(0);
  const [opp, setOpp] = useState<number | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confetti, setConfetti] = useState(0);
  const [tx, setTx] = useState<{ hash: string | null; status: TxStatus }>({ hash: null, status: 'idle' });

  useEffect(() => {
    if (!bet && parseFloat(casino.stats.minBet) > 0) setBet(casino.stats.minBet);
  }, [casino.stats.minBet, bet]);

  const betError = getBetError(bet, mult, casino.stats.minBet, casino.stats.maxBet);

  const play = async () => {
    if (!wallet.isConnected) return toast.error('Connect wallet first');
    if (betError) return toast.error(betError);
    setResult(null); setOpp(null);
    playSpinSound();
    setShake(s => s + 1);
    setTx({ hash: null, status: 'pending' });
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playRPS(pick, finalBet);
      const raw = decodeByte(r.resultBytes, 0);
      const byte = raw !== null
        ? raw % 3
        : (r.win ? (pick + 2) % 3 : (pick + 1) % 3);
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'RPS', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      setTimeout(() => {
        setOpp(byte);
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({
          game: 'Rock Paper Scissors', win: r.win, payout: r.payout, txHash: r.txHash,
          rewardLabel: `Opponent: ${NAMES[byte]}`,
          txStatus: 'confirmed',
        });
        if (r.win) setConfetti(c => c + 1);
      }, 1300);
    } catch (e: any) {
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Rock · Paper · Scissors" subtitle="Beat the wolf — win 1.9× your bet" icon="✊" accent="green">
      <Confetti trigger={confetti} />
      <div className="casino-felt rounded-2xl p-6 grid grid-cols-2 gap-4 min-h-[220px] items-center relative">
        <div className="text-center">
          <div className="text-xs uppercase text-muted-foreground mb-2 tracking-widest">You</div>
          <motion.div
            key={shake + 'p'}
            className="text-7xl hand-shake inline-block"
          >{MOVES[pick]}</motion.div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase text-muted-foreground mb-2 tracking-widest">Wolf</div>
          <AnimatePresence mode="wait">
            {opp === null ? (
              <motion.div key={shake + 'o'} className="text-7xl hand-shake inline-block">🐺</motion.div>
            ) : (
              <motion.div
                key={'op' + opp}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-7xl inline-block"
              >{MOVES[opp]}</motion.div>
            )}
          </AnimatePresence>
        </div>
        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && opp === null)} label="Wolf is throwing…" />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        {MOVES.map((m, i) => (
          <button
            key={m}
            onClick={() => setPick(i as 0 | 1 | 2)}
            disabled={!!casino.busy}
            className={`py-3 rounded-xl text-3xl border-2 transition-all ${
              pick === i
                ? 'border-wolf-green bg-wolf-green/15'
                : 'border-wolf-border/30 bg-wolf-surface hover:border-wolf-green/40'
            }`}
          >
            {m}
            <div className="text-[10px] text-muted-foreground mt-1">{NAMES[i]}</div>
          </button>
        ))}
      </div>

      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Throw ${NAMES[pick]} for ${applyMultiplier(bet, mult)} zkLTC`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
    </GameShell>
  );
}
