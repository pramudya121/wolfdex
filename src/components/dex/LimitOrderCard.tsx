import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, NATIVE_TOKEN, type TokenInfo, CHAIN_CONFIG, isWrapUnwrap } from '@/config/contracts';
import { toast } from 'sonner';
import TokenModal from './TokenModal';
import { useTxSettings, useDexContext } from '@/context/DexContext';
import type { RouteQuote } from '@/hooks/useDex';
import type { LimitOrder } from '@/hooks/useLimitOrders';

interface Props {
  getBestRoute: (from: TokenInfo, to: TokenInfo, amountIn: string) => Promise<RouteQuote | null>;
  getTokenBalance: (address: string) => Promise<string>;
  isConnected: boolean;
  account: string | null;
  onConnectClick: () => void;
  /** Place a real on-chain limit order. */
  onCreate: (order: {
    account: string;
    fromToken: TokenInfo;
    toToken: TokenInfo;
    amountIn: string;
    targetRate: string;
    side: 'sell' | 'buy';
    expiresAt: number;
  }) => Promise<LimitOrder>;
}

const EXPIRY_OPTIONS = [
  { label: '1H',   minutes: 60 },
  { label: '24H',  minutes: 60 * 24 },
  { label: '7D',   minutes: 60 * 24 * 7 },
  { label: 'Never', minutes: 0 },
];

export default function LimitOrderCard({
  getBestRoute, getTokenBalance, isConnected, account, onConnectClick, onCreate,
}: Props) {
  const { slippage } = useTxSettings();
  const [fromToken, setFromToken] = useState<TokenInfo>(NATIVE_TOKEN);
  const [toToken, setToToken] = useState<TokenInfo>(TOKENS[1]);
  const [amountIn, setAmountIn] = useState('');
  const [targetRate, setTargetRate] = useState('');
  const [marketRate, setMarketRate] = useState<string | null>(null);
  const [fromBalance, setFromBalance] = useState('0');
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState(60 * 24); // 24H default

  const wrapType = isWrapUnwrap(fromToken.address, toToken.address);

  // Load balance
  const loadBalance = useCallback(async () => {
    if (!isConnected) return;
    setFromBalance(await getTokenBalance(fromToken.address));
  }, [isConnected, fromToken, getTokenBalance]);
  useEffect(() => { loadBalance(); }, [loadBalance]);

  // Refresh market rate ~ every 10s using a unit input (1 fromToken)
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const q = await getBestRoute(fromToken, toToken, '1');
      if (!cancelled) setMarketRate(q ? q.amountOut : null);
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [fromToken, toToken, getBestRoute]);

  // Auto-prefill target with +1% above market on token change (only if user hasn't typed)
  useEffect(() => {
    if (!targetRate && marketRate && parseFloat(marketRate) > 0) {
      setTargetRate((parseFloat(marketRate) * 1.01).toFixed(6));
    }
  }, [marketRate]);  // eslint-disable-line react-hooks/exhaustive-deps

  const ratePremium = (() => {
    const t = parseFloat(targetRate);
    const m = parseFloat(marketRate || '0');
    if (!t || !m) return null;
    return ((t / m - 1) * 100);
  })();

  const handleSwitch = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setTargetRate('');
  };

  const handleCreate = () => {
    if (!isConnected || !account) { onConnectClick(); return; }
    const amt = parseFloat(amountIn);
    const rate = parseFloat(targetRate);
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    if (!rate || rate <= 0) { toast.error('Enter a valid target rate'); return; }
    if (amt > parseFloat(fromBalance)) { toast.error('Insufficient balance'); return; }
    if (wrapType) { toast.error('Use the Swap tab to wrap/unwrap'); return; }

    const expiresAt = expiryMinutes > 0 ? Date.now() + expiryMinutes * 60_000 : 0;
    onCreate({
      account,
      fromToken,
      toToken,
      amountIn,
      targetRate,
      side: 'sell',
      expiresAt,
    });
    toast.success('Limit order created', {
      description: `Sell ${amt} ${fromToken.symbol} when 1 ${fromToken.symbol} ≥ ${targetRate} ${toToken.symbol}`,
    });
    setAmountIn('');
  };

  const expectedOut = (() => {
    const a = parseFloat(amountIn);
    const r = parseFloat(targetRate);
    if (!a || !r) return null;
    return (a * r).toFixed(6);
  })();

  return (
    <>
      <div className="moving-border-wrap w-full max-w-[420px] mx-auto wolf-glow">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="moving-border-inner rounded-2xl p-5 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              Limit Order
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-wolf-pink/20 text-wolf-pink font-medium">BETA</span>
            </h2>
            <span className="text-[10px] text-muted-foreground">Auto-fills every 15s</span>
          </div>

          {/* You sell */}
          <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">You sell</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{parseFloat(fromBalance).toFixed(4)}</span>
                <button onClick={() => setAmountIn(fromBalance)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-pink/15 text-wolf-pink hover:bg-wolf-pink/25 transition-all font-semibold"
                >MAX</button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" value={amountIn} onChange={e => setAmountIn(e.target.value)}
                placeholder="0" className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
              />
              <button onClick={() => setShowFromModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all shrink-0"
              >
                <img src={fromToken.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className="font-semibold text-sm">{fromToken.symbol}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Switch */}
          <div className="flex justify-center -my-3 relative z-10">
            <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}
              onClick={handleSwitch}
              className="w-10 h-10 rounded-xl bg-wolf-surface border-2 border-wolf-border/40 flex items-center justify-center hover:border-wolf-pink/50 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 10l5 5 5-5"/></svg>
            </motion.button>
          </div>

          {/* For (token to receive) */}
          <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">To buy</span>
              {expectedOut && (
                <span className="text-xs text-muted-foreground">~{expectedOut} {toToken.symbol}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input value={expectedOut || ''} readOnly placeholder="0"
                className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
              />
              <button onClick={() => setShowToModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all shrink-0"
              >
                <img src={toToken.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                <span className="font-semibold text-sm">{toToken.symbol}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
              </button>
            </div>
          </div>

          {/* Target rate */}
          <div className="mt-3 rounded-xl bg-wolf-dark/40 p-3 border border-wolf-border/15">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Target rate (1 {fromToken.symbol} ≥)</span>
              <span className="text-[10px] text-muted-foreground">
                Market: {marketRate ? `${parseFloat(marketRate).toFixed(6)} ${toToken.symbol}` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" value={targetRate} onChange={e => setTargetRate(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent text-lg font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
              />
              <span className="text-sm font-medium text-muted-foreground">{toToken.symbol}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-1">
                {[1, 5, 10].map(p => (
                  <button key={p}
                    onClick={() => marketRate && setTargetRate((parseFloat(marketRate) * (1 + p / 100)).toFixed(6))}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-surface hover:bg-wolf-surface-hover transition-all"
                  >+{p}%</button>
                ))}
              </div>
              {ratePremium != null && (
                <span className={`text-[10px] font-medium ${ratePremium >= 0 ? 'text-wolf-green' : 'text-yellow-400'}`}>
                  {ratePremium >= 0 ? '+' : ''}{ratePremium.toFixed(2)}% vs market
                </span>
              )}
            </div>
          </div>

          {/* Expiry */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Expires in</span>
            <div className="flex gap-1">
              {EXPIRY_OPTIONS.map(opt => (
                <button key={opt.label} onClick={() => setExpiryMinutes(opt.minutes)}
                  className={`text-[10px] px-2 py-1 rounded-full transition-all ${
                    expiryMinutes === opt.minutes
                      ? 'bg-wolf-pink text-white font-semibold'
                      : 'bg-wolf-surface text-muted-foreground hover:bg-wolf-surface-hover'
                  }`}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isConnected && (!amountIn || !targetRate)}
            className="w-full mt-4 py-4 rounded-2xl font-bold text-base transition-all wolf-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!isConnected ? 'Connect Wallet' : 'Place Limit Order'}
          </button>

          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Order auto-executes when market price crosses your target. Slippage: {slippage}%.
          </p>
        </motion.div>
      </div>

      <TokenModal isOpen={showFromModal} onClose={() => setShowFromModal(false)} onSelect={setFromToken} excludeAddress={toToken.address} />
      <TokenModal isOpen={showToModal} onClose={() => setShowToModal(false)} onSelect={setToToken} excludeAddress={fromToken.address} />
    </>
  );
}
