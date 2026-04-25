import { useState, useEffect } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

export default function CoinflipGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const [animKey, setAnimKey] = useState(0);
  const [final, setFinal] = useState<'heads' | 'tails' | null>(null);
  const [result, setResult] = useState<any>(null);
  const [confetti, setConfetti] = useState(0);
  const [tx, setTx] = useState<{ hash: string | null; status: TxStatus }>({ hash: null, status: 'idle' });

  // Auto-fill the bet with the chain's minBet as soon as stats load,
  // so the first click always passes the contract's bet-size check.
  useEffect(() => {
    if (!bet && parseFloat(casino.stats.minBet) > 0) setBet(effectiveMinBet(casino.stats.minBet));
  }, [casino.stats.minBet, bet]);

  const betError = getBetError(bet, mult, casino.stats.minBet, casino.stats.maxBet);

  const play = async () => {
    if (!wallet.isConnected) return toast.error('Connect wallet first');
    if (betError) return toast.error(betError);
    setFinal(null); setResult(null);
    setAnimKey(k => k + 1);
    setTx({ hash: null, status: 'pending' });
    playSpinSound();
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playCoinflip(side === 'heads', finalBet);
      const raw = decodeByte(r.resultBytes, 0);
      const byte = raw !== null
        ? raw % 2
        : (r.win ? (side === 'heads' ? 1 : 0) : (side === 'heads' ? 0 : 1));
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'Coinflip', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      setTimeout(() => {
        setFinal(byte === 1 ? 'heads' : 'tails');
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({ game: 'Coinflip', win: r.win, payout: r.payout, txHash: r.txHash , txStatus: 'confirmed' });
        if (r.win) setConfetti(c => c + 1);
      }, 2500);
    } catch (e: any) {
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  return (
    <GameShell title="Coinflip" subtitle="50/50 — pick a side, double your stack" icon="🪙" accent="gold">
      <Confetti trigger={confetti} />
      <div className="casino-felt rounded-2xl p-8 flex items-center justify-center min-h-[260px] relative">
        <div className="relative" style={{ width: 160, height: 160 }}>
          <div
            key={animKey}
            className={`coin-3d w-full h-full ${
              animKey === 0 ? '' : final === 'heads' ? 'coin-flip-anim' : 'coin-flip-tails'
            }`}
          >
            <div className="coin-face text-5xl">🐺</div>
            <div className="coin-face coin-back text-5xl">⚡</div>
          </div>
        </div>
        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && !result)} label="Flipping on-chain…" />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        {(['heads', 'tails'] as const).map(s => (
          <button
            key={s}
            onClick={() => setSide(s)}
            disabled={!!casino.busy}
            className={`py-3 rounded-xl font-semibold text-sm transition-all border-2 ${
              side === s
                ? 'border-wolf-gold bg-wolf-gold/15 text-wolf-gold'
                : 'border-wolf-border/30 bg-wolf-surface text-muted-foreground hover:border-wolf-gold/40'
            }`}
          >
            {s === 'heads' ? '🐺 Heads' : '⚡ Tails'}
          </button>
        ))}
      </div>

      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Flip for ${applyMultiplier(bet, mult)} zkLTC`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
    </GameShell>
  );
}
