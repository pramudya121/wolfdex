import { useState, useEffect } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, BetInput, PlayButton, ResultBanner, Confetti, TxPanel, PendingOverlay, decodeByte, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

const SUITS = ['♠', '♥', '♦', '♣'];

function cardLabel(idx: number) {
  const rank = (idx % 13) + 1;
  const suit = SUITS[Math.floor(idx / 13) % 4];
  const r = rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
  return { r, suit, red: suit === '♥' || suit === '♦' };
}

export default function VideoPokerGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [guess, setGuess] = useState(7);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [flipping, setFlipping] = useState(false);
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
    setResult(null); setRevealed(null); setFlipping(true);
    playSpinSound();
    setTx({ hash: null, status: 'pending' });
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playVideoPoker(guess, finalBet);
      const raw = decodeByte(r.resultBytes, 0);
      const rank = raw !== null
        ? raw % 52
        : (r.win ? (guess - 1 + 13) % 52 : (guess - 1 + 26) % 52);
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'VideoPoker', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      setTimeout(() => {
        setRevealed(rank);
        setFlipping(false);
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash });
        notifyResult({
          game: 'Video Poker', win: r.win, payout: r.payout, txHash: r.txHash,
          rewardLabel: `Card rank: ${rank}`,
          txStatus: 'confirmed',
        });
        if (r.win) setConfetti(c => c + 1);
      }, 900);
    } catch (e: any) {
      setFlipping(false);
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  const card = revealed !== null ? cardLabel(revealed) : null;

  return (
    <GameShell title="Video Poker — High Card" subtitle="Pick a rank — beat the dealer's draw" icon="🃏" accent="cyan">
      <Confetti trigger={confetti} />
      <div className="casino-felt rounded-2xl p-6 min-h-[240px] flex items-center justify-center relative">
        <div style={{ perspective: 1000 }}>
          <div
            className="card-3d relative"
            style={{
              width: 140, height: 200,
              transform: revealed !== null ? 'rotateY(180deg)' : (flipping ? 'rotateY(90deg)' : 'rotateY(0deg)'),
            }}
          >
            <div className="card-face flex items-center justify-center text-4xl"
              style={{ background: 'linear-gradient(135deg, oklch(0.30 0.15 330), oklch(0.20 0.10 280))', color: 'oklch(0.85 0.10 90)', border: '2px solid oklch(0.65 0.25 330)' }}>
              🐺
            </div>
            <div
              className="card-face card-back flex flex-col items-center justify-center"
              style={{
                background: 'linear-gradient(180deg, oklch(0.95 0.01 80), oklch(0.85 0.02 80))',
                color: card?.red ? 'oklch(0.50 0.25 25)' : 'oklch(0.20 0.02 280)',
                border: '2px solid oklch(0.78 0.16 85)',
              }}
            >
              {card && (
                <>
                  <span className="text-6xl font-black">{card.r}</span>
                  <span className="text-5xl">{card.suit}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <PendingOverlay active={tx.status === 'pending' || (tx.status === 'confirmed' && revealed === null)} label="Drawing your card…" />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Your guess (1-13)</span>
          <span className="text-wolf-gold font-bold text-lg">{guess}</span>
        </div>
        <input type="range" min={1} max={13} value={guess} onChange={e => setGuess(Number(e.target.value))}
          disabled={!!casino.busy} className="w-full accent-wolf-pink" />
      </div>

      <div className="mt-3"><BetInput bet={bet} setBet={setBet} min={casino.stats.minBet} max={casino.stats.maxBet} disabled={!!casino.busy} multiplier={mult} error={betError} /></div>
      <MultiplierPicker value={mult} onChange={setMult} disabled={!!casino.busy} />
      <PlayButton onClick={play} busy={!!casino.busy} label={betError ?? `Draw ${applyMultiplier(bet, mult)} zkLTC · guess ${guess}`} disabled={!casino.stats.isActive || !!betError} />
      <ResultBanner result={result} />
      {result && tx.status === 'confirmed' && (
        <div className="text-center"><ReplayButton win={result.win} /></div>
      )}
      <TxPanel txHash={tx.hash} status={tx.status} payout={result?.payout} win={result?.win} />
    </GameShell>
  );
}
