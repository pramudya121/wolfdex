import { useState, useMemo, useEffect } from 'react';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';
import { GameShell, PlayButton, BetInput, ResultBanner, Confetti, REEL_TOKENS, TOKEN_TIER, TxPanel, PendingOverlay, decodeByte, autoSwapPayout, MultiplierPicker, applyMultiplier, getBetError, friendlyError, notifyResult, playSpinSound, ReplayButton, type BetMultiplier, type TxStatus } from './casinoShared';
import { toast } from 'sonner';

const ROW_H = 96;
const STRIP_LEN = 25;

function buildStrip(colOffset = 0, seedSym?: string) {
  const arr: typeof REEL_TOKENS = [];
  for (let i = 0; i < STRIP_LEN; i++) {
    arr.push(REEL_TOKENS[(i * 3 + colOffset) % REEL_TOKENS.length]);
  }
  if (seedSym) {
    const t = REEL_TOKENS.find(x => x.symbol === seedSym);
    if (t) arr[STRIP_LEN - 3] = t;
  }
  return arr;
}

export default function SlotGame() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const history = useCasinoHistory();
  const [bet, setBet] = useState('');
  const [mult, setMult] = useState<BetMultiplier>(1);
  const [reels, setReels] = useState<{ key: number; strip: typeof REEL_TOKENS; spinning: boolean; duration: number }[]>(
    [0, 1, 2].map(i => ({ key: i, strip: buildStrip(i), spinning: false, duration: 0 }))
  );
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
    setResult(null);
    playSpinSound();
    setTx({ hash: null, status: 'pending' });
    setReels(rs => rs.map((r, i) => ({
      ...r,
      key: r.key + 1,
      strip: buildStrip(i),
      spinning: true,
      duration: 2 + i * 0.5,
    })));
    const finalBet = applyMultiplier(bet, mult);
    try {
      const r = await casino.playSlot([0, 0, 0], finalBet);
      const symbols: string[] = [];
      for (let i = 0; i < 3; i++) {
        const raw = decodeByte(r.resultBytes, i);
        const byte = raw !== null ? raw : i;
        symbols.push(REEL_TOKENS[byte % REEL_TOKENS.length].symbol);
      }
      if (r.win) {
        const winSym = [...symbols].sort((a, b) => (TOKEN_TIER[b] || 1) - (TOKEN_TIER[a] || 1))[0];
        symbols[0] = winSym; symbols[1] = winSym; symbols[2] = winSym;
      } else if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
        symbols[2] = REEL_TOKENS[(REEL_TOKENS.findIndex(t => t.symbol === symbols[2]) + 1) % REEL_TOKENS.length].symbol;
      }
      setTx({ hash: r.txHash, status: 'confirmed' });
      history.add({ game: 'Slot', bet: finalBet, payout: r.payout, win: r.win, txHash: r.txHash });
      setTimeout(() => setReels(rs => rs.map((r2, i) => ({
        ...r2, strip: buildStrip(i, symbols[i]), spinning: true, key: r2.key + 100, duration: 2 + i * 0.5,
      }))), 30);

      const totalDelay = (2 + 2 * 0.5) * 1000 + 200;
      setTimeout(() => {
        setReels(rs => rs.map(r2 => ({ ...r2, spinning: false })));
        const winToken = REEL_TOKENS.find(t => t.symbol === symbols[0]);
        setResult({ win: r.win, payout: r.payout, txHash: r.txHash, rewardToken: r.win ? winToken : undefined });
        notifyResult({
          game: 'Wolf Slots', win: r.win, payout: r.payout, txHash: r.txHash,
          rewardLabel: r.win && winToken ? `3× ${winToken.symbol}` : `${symbols.join(' / ')}`,
          txStatus: 'confirmed',
        });
        if (r.win) {
          setConfetti(c => c + 1);
          if (winToken) autoSwapPayout(wallet.signer, wallet.address, winToken, r.payoutWei);
        }
      }, totalDelay);
    } catch (e: any) {
      setReels(rs => rs.map(r2 => ({ ...r2, spinning: false })));
      setTx(t => ({ ...t, status: 'failed' }));
      toast.error(friendlyError(e));
    }
  };

  const tierList = useMemo(
    () => REEL_TOKENS
      .map(t => ({ token: t, mult: TOKEN_TIER[t.symbol] || 1 }))
      .sort((a, b) => b.mult - a.mult),
    []
  );

  return (
    <GameShell title="Wolf Slots" subtitle="3 matching tokens = jackpot in that token" icon="🎰" accent="pink">
      <Confetti trigger={confetti} />
      <div className="slot-cabinet p-5 relative">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {reels.map((r, idx) => (
            <div key={idx} className="slot-window" style={{ height: ROW_H * 3 }}>
              <div
                key={r.key}
                className={r.spinning ? 'reel-strip reel-spinning' : 'reel-strip'}
                style={{
                  ['--reel-distance' as any]: `${(STRIP_LEN - 3) * ROW_H}px`,
                  ['--reel-duration' as any]: `${r.duration}s`,
                }}
              >
                {r.strip.map((tk, i) => (
                  <div key={i} style={{ height: ROW_H }} className="flex items-center justify-center">
                    <img src={tk.logo} alt={tk.symbol} className="w-16 h-16 rounded-full ring-2 ring-wolf-gold/40 shadow-lg" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-[10px] text-wolf-gold/80 uppercase tracking-widest font-bold">
          Match 3 → win that token
        </div>
        <PendingOverlay active={tx.status === 'pending'} label="Spinning reels on-chain…" />
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 text-center">
          All WolfDex tokens · reward tier
        </div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-1.5">
          {tierList.map(({ token: t, mult }) => (
            <div key={t.symbol} className="text-center p-2 rounded-lg bg-wolf-surface border border-wolf-border/30 hover:border-wolf-gold/40 transition-colors">
              <img src={t.logo} alt={t.symbol} className="w-7 h-7 mx-auto rounded-full ring-1 ring-wolf-gold/30" />
              <div className="text-[9px] font-semibold mt-0.5 truncate">{t.symbol}</div>
              <div className="text-[9px] font-bold text-wolf-gold">×{mult}</div>
            </div>
          ))}
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
    </GameShell>
  );
}
