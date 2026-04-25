import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { useDexContext } from '@/context/DexContext';
import { useCasino } from '@/hooks/useCasino';
import CoinflipGame from './casino/CoinflipGame';
import SlotGame from './casino/SlotGame';
import PlinkoGame from './casino/PlinkoGame';
import RPSGame from './casino/RPSGame';
import VideoPokerGame from './casino/VideoPokerGame';
import RouletteGame from './casino/RouletteGame';
import LuckyWheelGame from './casino/LuckyWheelGame';
import SpinToWinGame from './casino/SpinToWinGame';
import { toast } from 'sonner';
import { CHAIN_CONFIG, CONTRACTS } from '@/config/contracts';
import { isCasinoMuted, setCasinoMuted, UI_MIN_BET_STR } from './casino/casinoShared';
import { startCasinoMusic, stopCasinoMusic, syncCasinoMusicMute } from './casino/casinoMusic';
import { useCasinoHistory } from '@/hooks/useCasinoHistory';

const GAMES = [
  { id: 'coinflip',   label: 'Coinflip',     icon: '🪙', accent: 'gold'  },
  { id: 'slot',       label: 'Wolf Slots',   icon: '🎰', accent: 'pink'  },
  { id: 'plinko',     label: 'Plinko',       icon: '🎯', accent: 'cyan'  },
  { id: 'rps',        label: 'Rock Paper',   icon: '✊', accent: 'green' },
  { id: 'videopoker', label: 'Video Poker',  icon: '🃏', accent: 'cyan'  },
  { id: 'roulette',   label: 'Roulette',     icon: '🎡', accent: 'pink'  },
  { id: 'wheel',      label: 'Lucky Wheel',  icon: '🍀', accent: 'gold'  },
  { id: 'spin',       label: 'Spin to Win',  icon: '✨', accent: 'pink'  },
] as const;
type GameId = typeof GAMES[number]['id'];

export default function CasinoView() {
  const { wallet } = useDexContext();
  const casino = useCasino(wallet.signer, wallet.address);
  const [active, setActive] = useState<GameId>('coinflip');
  const [muted, setMuted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [musicReady, setMusicReady] = useState(false);
  useEffect(() => { setMuted(isCasinoMuted()); }, []);

  // Background music — start on first user gesture (browser autoplay policy),
  // stop when the user navigates away from /casino. Also stops on mute toggle.
  useEffect(() => {
    if (muted) { stopCasinoMusic(); setMusicReady(false); return; }
    const onGesture = () => {
      startCasinoMusic();
      setMusicReady(true);
    };
    // Try immediately (works after the first click on the page)
    startCasinoMusic();
    setMusicReady(true);
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      stopCasinoMusic();
    };
  }, [muted]);

  // Detect owner so we can highlight the Admin button only for them
  useEffect(() => {
    let cancelled = false;
    if (!wallet.address) { setIsOwner(false); return; }
    (async () => {
      try {
        const owner = await casino.getOwner();
        if (!cancelled) setIsOwner(owner.toLowerCase() === wallet.address!.toLowerCase());
      } catch {
        if (!cancelled) setIsOwner(false);
      }
    })();
    return () => { cancelled = true; };
  }, [casino, wallet.address]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setCasinoMuted(next);
    syncCasinoMusicMute();
    toast.success(next ? '🔇 Sound muted' : '🔊 Sound on');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([casino.refreshStats(), wallet.refreshBalance()]);
      toast.success('Casino stats refreshed');
    } catch {
      toast.error('Refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-wolf-pink/10 border border-wolf-pink/30 text-wolf-pink text-xs font-semibold mb-4">
          <span className="w-2 h-2 rounded-full bg-wolf-green animate-pulse" />
          On-chain casino · LitVM LiteForge
        </div>
        <h1 className="text-5xl md:text-6xl font-black casino-title mb-3">WOLFDEX CASINO</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Eight provably-on-chain games. Every bet, every payout — settled by smart contract on{' '}
          <a href={`${CHAIN_CONFIG.blockExplorer}/address/${CONTRACTS.CASINO}`} target="_blank" rel="noreferrer" className="text-wolf-gold underline-offset-2 hover:underline">
            {CONTRACTS.CASINO.slice(0,8)}…{CONTRACTS.CASINO.slice(-6)}
          </a>
        </p>
        <div className="mt-3 flex justify-center gap-2 flex-wrap">
          <button
            onClick={toggleMute}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-wolf-surface border border-wolf-border/40 text-xs font-semibold hover:border-wolf-pink/50 transition-all"
          >
            {muted ? '🔇 Audio off' : '🎷 Lounge music on'}
            {!muted && musicReady && (
              <span className="flex items-end gap-[2px] h-3" aria-hidden>
                <span className="w-[2px] bg-wolf-gold rounded-sm casino-eq-bar casino-eq-1" />
                <span className="w-[2px] bg-wolf-pink rounded-sm casino-eq-bar casino-eq-2" />
                <span className="w-[2px] bg-wolf-cyan rounded-sm casino-eq-bar casino-eq-3" />
              </span>
            )}
          </button>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-wolf-surface border border-wolf-border/40 text-xs font-semibold hover:border-wolf-gold/50 hover:text-wolf-gold transition-all disabled:opacity-50"
          >
            {refreshing ? '⏳ Refreshing…' : '🔄 Refresh stats'}
          </button>
          {wallet.isConnected && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-wolf-gold/10 border border-wolf-gold/40 text-xs font-semibold text-wolf-gold">
              💎 {parseFloat(wallet.balance).toFixed(4)} zkLTC
            </span>
          )}
          <Link
            to="/casino/admin"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              isOwner
                ? 'bg-gradient-to-r from-wolf-gold to-wolf-pink text-wolf-dark border border-wolf-gold shadow-lg shadow-wolf-gold/20 hover:scale-[1.04]'
                : 'bg-wolf-surface border border-wolf-border/40 hover:border-wolf-gold/50 hover:text-wolf-gold'
            }`}
          >
            🛠️ {isOwner ? 'Owner Admin Panel' : 'Admin Panel'}
          </Link>
        </div>
      </motion.div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatTile label="Min Bet"  value={`${UI_MIN_BET_STR} zkLTC`} />
        <StatTile label="Max Bet"  value={`${parseFloat(casino.stats.maxBet).toFixed(2)} zkLTC`} />
        <StatTile label="House Edge" value={`${(casino.stats.houseEdgeBP / 100).toFixed(2)}%`} />
        <StatTile label="Bankroll" value={`${parseFloat(casino.stats.bankroll).toFixed(2)} zkLTC`} highlight />
        <StatTile label="Status"   value={casino.stats.isActive ? '🟢 LIVE' : '🔴 OFF'} />
      </div>

      {/* Game tabs — neon casino chips */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2.5 mb-6">
        {GAMES.map((g, i) => {
          const isActive = active === g.id;
          return (
            <motion.button
              key={g.id}
              onClick={() => setActive(g.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.96 }}
              className={`casino-game-chip relative p-3 rounded-xl text-center transition-colors group overflow-hidden ${
                isActive ? 'casino-game-chip-active' : ''
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="casino-tab-active"
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-wolf-pink/25 via-wolf-gold/15 to-wolf-pink/25 border-2 border-wolf-pink"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative block">
                <span className="text-2xl mb-1 block transition-transform group-hover:scale-110">{g.icon}</span>
                <span className="text-[11px] font-bold leading-tight block">{g.label}</span>
              </span>
              <span className="casino-chip-shine" />
            </motion.button>
          );
        })}
      </div>

      {/* Live plays ticker */}
      <LivePlaysTicker />

      {/* Active game */}
      <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0,  filter: 'blur(0px)' }}
            exit={{    opacity: 0, y: -10, filter: 'blur(6px)' }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {active === 'coinflip'   && <CoinflipGame   />}
            {active === 'slot'       && <SlotGame       />}
            {active === 'plinko'     && <PlinkoGame     />}
            {active === 'rps'        && <RPSGame        />}
            {active === 'videopoker' && <VideoPokerGame />}
            {active === 'roulette'   && <RouletteGame   />}
            {active === 'wheel'      && <LuckyWheelGame />}
            {active === 'spin'       && <SpinToWinGame  />}
          </motion.div>
        </AnimatePresence>

        {/* Last settlement — small, only shown after a play */}
        {casino.lastResult && (
          <div className="mt-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="casino-card p-5"
            >
              <h4 className="font-bold mb-2 flex items-center gap-2">📜 Last Settlement</h4>
              <div className="space-y-1.5 text-sm">
                <Row k="Game"    v={casino.lastResult.game} />
                <Row k="Outcome" v={casino.lastResult.win ? '🏆 WIN' : '❌ LOSS'} />
                <Row k="Payout"  v={`${parseFloat(casino.lastResult.payout).toFixed(4)} zkLTC`} />
                <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${casino.lastResult.txHash}`} target="_blank" rel="noreferrer"
                  className="block text-xs font-mono text-wolf-pink hover:text-wolf-gold transition-colors mt-2 truncate">
                  {casino.lastResult.txHash} ↗
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-muted-foreground mt-8 max-w-xl mx-auto">
        ⚠️ Testnet game — bet only what you can afford to lose. All randomness on-chain. Payouts limited by current bankroll.
      </p>
    </div>
  );
}

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border ${highlight ? 'bg-wolf-gold/10 border-wolf-gold/40' : 'bg-wolf-surface border-wolf-border/40'}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold mt-0.5 ${highlight ? 'text-wolf-gold' : ''}`}>{value}</div>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
