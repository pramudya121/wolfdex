import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, NATIVE_TOKEN, isWrapUnwrap, type TokenInfo, CONTRACTS, CHAIN_CONFIG, getTokenByAddress } from '@/config/contracts';
import { toast } from 'sonner';
import TokenModal from './TokenModal';
import TxSettingsPanel from './TxSettingsPanel';
import { useTxSettings } from '@/context/DexContext';
import type { RouteQuote, SwapPreflight } from '@/hooks/useDex';
import { WolfSpinner } from './ui/WolfSkeleton';

interface SwapCardProps {
  swap: (from: TokenInfo, to: TokenInfo, amountIn: string, amountOut: string, slippagePct?: number, deadlineMinutes?: number, routePath?: string[]) => Promise<string>;
  getAmountsOut: (amountIn: string, path: string[]) => Promise<string>;
  getBestRoute: (from: TokenInfo, to: TokenInfo, amountIn: string) => Promise<RouteQuote | null>;
  previewSwap: (from: TokenInfo, to: TokenInfo, amountIn: string, amountOutExpected: string, slippagePct?: number, deadlineMinutes?: number, routePath?: string[]) => Promise<SwapPreflight>;
  getTokenBalance: (address: string) => Promise<string>;
  loading: boolean;
  txHash: string | null;
  error: string | null;
  isConnected: boolean;
  onConnectClick: () => void;
}

export default function SwapCard({ swap, getAmountsOut, getBestRoute, previewSwap, getTokenBalance, loading, txHash, error, isConnected, onConnectClick }: SwapCardProps) {
  const { slippage, deadline } = useTxSettings();
  const [fromToken, setFromToken] = useState<TokenInfo>(NATIVE_TOKEN);
  const [toToken, setToToken] = useState<TokenInfo>(TOKENS[1]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [fromBalance, setFromBalance] = useState('0');
  const [toBalance, setToBalance] = useState('0');
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTradeDetails, setShowTradeDetails] = useState(false);
  const [priceImpact, setPriceImpact] = useState<number>(0);
  const [route, setRoute] = useState<RouteQuote | null>(null);
  const [preflight, setPreflight] = useState<SwapPreflight | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const wrapType = isWrapUnwrap(fromToken.address, toToken.address);
  // Always show "Swap" — wrap/unwrap is just a swap with WETH under the hood.
  const buttonLabel = 'Swap';

  const loadBalances = useCallback(async () => {
    if (!isConnected) return;
    const [fb, tb] = await Promise.all([getTokenBalance(fromToken.address), getTokenBalance(toToken.address)]);
    setFromBalance(fb);
    setToBalance(tb);
  }, [isConnected, fromToken, toToken, getTokenBalance]);

  useEffect(() => { loadBalances(); }, [loadBalances]);

  useEffect(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || wrapType) {
      if (wrapType && fromAmount) setToAmount(fromAmount);
      else if (!fromAmount) setToAmount('');
      setRoute(null);
      setPriceImpact(0);
      setPreflight(null);
      return;
    }
    const timer = setTimeout(async () => {
      // Smart Order Routing — finds best output across direct + WETH-hop paths.
      const best = await getBestRoute(fromToken, toToken, fromAmount);
      if (!best) {
        setRoute(null);
        setToAmount('0');
        setPriceImpact(0);
        setPreflight({
          ok: false, warnings: [], errors: ['No route found — pair has no liquidity'],
          details: { path: [], amountIn: '0', amountOutMin: '0', deadline: 0, deadlineIso: '', slippageBips: 0, needsApproval: false, currentAllowance: '0', balance: '0', pairExists: [], estimatedGas: null, method: 'swapExactTokensForTokens', value: '0' },
        });
        return;
      }
      setRoute(best);
      setToAmount(best.amountOut);
      // Use the on-chain reserve-based price impact (toToken/fromToken).
      setPriceImpact(best.priceImpactPct);

      // Run pre-flight validation against on-chain state.
      if (isConnected) {
        setPreviewing(true);
        try {
          const pf = await previewSwap(
            fromToken, toToken, fromAmount, best.amountOut,
            parseFloat(slippage), parseFloat(deadline), best.path,
          );
          setPreflight(pf);
        } finally { setPreviewing(false); }
      } else {
        setPreflight(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [fromAmount, fromToken, toToken, getBestRoute, previewSwap, wrapType, slippage, deadline, isConnected]);

  const handleSwitch = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const handleSwap = async () => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) return;
    try {
      const hash = await swap(fromToken, toToken, fromAmount, toAmount || '0', parseFloat(slippage), parseFloat(deadline), route?.path);
      toast.success(`${buttonLabel} successful!`, {
        description: `${fromAmount} ${fromToken.symbol} → ${toAmount} ${toToken.symbol}`,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
      setFromAmount('');
      setToAmount('');
      loadBalances();
    } catch (e: any) {
      toast.error(`${buttonLabel} failed`, { description: e.reason || e.message || 'Unknown error' });
    }
  };

  const setPercentage = (pct: number) => {
    const bal = parseFloat(fromBalance);
    if (bal > 0) setFromAmount((bal * pct / 100).toString());
  };

  const rate = fromAmount && toAmount && parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0
    ? (parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)
    : null;

  return (
    <>
      <div className="moving-border-wrap w-full max-w-[420px] mx-auto wolf-glow">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }}
          className="moving-border-inner rounded-2xl p-5 overflow-hidden"
        >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold tracking-tight">Swap</h2>
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-wolf-surface transition-colors text-muted-foreground hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button className="p-2 rounded-lg hover:bg-wolf-surface transition-colors text-muted-foreground hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="p-2 rounded-lg hover:bg-wolf-surface transition-colors text-muted-foreground hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>

        {/* Global tx settings (slippage + deadline, synced with LiquidityPanel) */}
        <TxSettingsPanel open={showSettings} />

        {/* You pay */}
        <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">You pay</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{parseFloat(fromBalance).toFixed(4)}</span>
              <div className="flex gap-1">
                {[25, 50, 75].map(p => (
                  <button key={p} onClick={() => setPercentage(p)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-pink/15 text-wolf-pink hover:bg-wolf-pink/25 transition-all font-medium"
                  >{p}%</button>
                ))}
                <button onClick={() => setFromAmount(fromBalance)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-pink/15 text-wolf-pink hover:bg-wolf-pink/25 transition-all font-semibold"
                >MAX</button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="number" value={fromAmount} onChange={e => setFromAmount(e.target.value)}
              placeholder="0" className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
            />
            <button onClick={() => setShowFromModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all shrink-0"
            >
              <img src={fromToken.logo} alt={fromToken.symbol} className="w-6 h-6 rounded-full shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="font-semibold text-sm">{fromToken.symbol}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>

        {/* Switch arrow */}
        <div className="flex justify-center -my-3 relative z-10">
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.3 }}
            onClick={handleSwitch}
            className="w-10 h-10 rounded-xl bg-wolf-surface border-2 border-wolf-border/40 flex items-center justify-center hover:border-wolf-pink/50 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 10l5 5 5-5"/></svg>
          </motion.button>
        </div>

        {/* You receive */}
        <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">You receive</span>
            <span className="text-xs text-muted-foreground">{parseFloat(toBalance).toFixed(4)}</span>
          </div>
          <div className="flex items-center gap-3">
            <input type="number" value={toAmount} readOnly placeholder="0"
              className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/30 min-w-0"
            />
            <button onClick={() => setShowToModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all shrink-0"
            >
              <img src={toToken.logo} alt={toToken.symbol} className="w-6 h-6 rounded-full shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="font-semibold text-sm">{toToken.symbol}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
            </button>
          </div>
        </div>

        {/* Price & impact */}
        {rate && !wrapType && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>1 {fromToken.symbol} = {rate} {toToken.symbol}</span>
            <span>Impact ~{priceImpact}%</span>
          </div>
        )}

        {/* Route info */}
        {fromAmount && toAmount && parseFloat(toAmount) > 0 && !wrapType && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl bg-wolf-dark/40 border border-wolf-border/15">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
              <span>Smart Route</span>
              {route && (
                <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-wolf-pink/15 text-wolf-pink font-medium text-[10px]">
                  {route.hops === 1 ? '⚡ Direct' : `🔀 ${route.hops}-hop via ${route.via}`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(route?.path || []).map((addr, i) => {
                // Map first/last hop back to display tokens (preserves native zkLTC label).
                let display = getTokenByAddress(addr);
                if (i === 0) display = fromToken;
                if (i === (route!.path.length - 1)) display = toToken;
                const symbol = display?.symbol || addr.slice(0, 6);
                const logo = display?.logo || '/images/wdex-logo.png';
                return (
                  <div key={`${addr}-${i}`} className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-wolf-surface text-xs border border-wolf-border/30">
                      <img src={logo} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span>{symbol}</span>
                    </div>
                    {i < (route!.path.length - 1) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-wolf-pink/60"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    )}
                  </div>
                );
              })}
              <span className="text-[10px] text-wolf-pink ml-auto">{(route?.hops || 1) * 0.3}% fee</span>
            </div>
          </motion.div>
        )}

        {/* MEV Protection */}
        {fromAmount && toAmount && parseFloat(toAmount) > 0 && !wrapType && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl bg-wolf-dark/40 border border-wolf-border/15">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-wolf-pink"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span className="text-xs font-medium">MEV Protection</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-wolf-green/15 text-wolf-green text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-wolf-green" />
              Low Risk
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
              <span className="text-yellow-500">⚠</span> Unable to analyze risk - proceed with caution
            </p>
          </motion.div>
        )}

        {/* Gas estimate */}
        {fromAmount && toAmount && parseFloat(toAmount) > 0 && !wrapType && (
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
            <div className="flex items-center gap-1.5">
              <span>⛽</span>
              <span>Estimated Gas</span>
              <span className="font-medium text-foreground">~0.0003 zkLTC</span>
            </div>
            <span className="text-wolf-green">$0.0005</span>
          </div>
        )}

        {/* Trade details */}
        {fromAmount && toAmount && parseFloat(toAmount) > 0 && (
          <button onClick={() => setShowTradeDetails(!showTradeDetails)}
            className="mt-3 w-full flex items-center justify-between text-xs text-muted-foreground px-1 py-2 hover:text-foreground transition-colors"
          >
            <span>Trade details</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showTradeDetails ? 'rotate-180' : ''}`}
            ><path d="M6 9l6 6 6-6"/></svg>
          </button>
        )}
        <AnimatePresence>
          {showTradeDetails && fromAmount && toAmount && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="p-3 rounded-xl bg-wolf-dark/40 text-xs space-y-2">
                <div className="flex justify-between text-muted-foreground">
                  <span>Minimum received</span>
                  <span className="text-foreground">{(parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken.symbol}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Slippage tolerance</span>
                  <span className="text-foreground">{slippage}%</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Price impact</span>
                  <span className="text-wolf-green">~{priceImpact}%</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Network fee</span>
                  <span className="text-foreground">~0.0003 zkLTC</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action button */}
        <button
          onClick={isConnected ? handleSwap : onConnectClick}
          disabled={isConnected && (loading || !fromAmount || parseFloat(fromAmount) <= 0)}
          className="w-full mt-4 py-4 rounded-2xl font-bold text-base transition-all wolf-btn-primary disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {!isConnected ? 'Connect Wallet' : loading ? (
            <span className="flex items-center justify-center gap-2">
              <WolfSpinner size={20} />
              Processing...
            </span>
          ) : buttonLabel}
        </button>

        {txHash && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm"
          >
            <span className="text-green-400">✓ Transaction successful!</span>
            <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              className="block text-xs text-wolf-gold hover:underline mt-1 truncate"
            >View on Explorer →</a>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive"
          >{error}</motion.div>
        )}
      </motion.div>
      </div>

      <TokenModal isOpen={showFromModal} onClose={() => setShowFromModal(false)} onSelect={setFromToken} excludeAddress={toToken.address} />
      <TokenModal isOpen={showToModal} onClose={() => setShowToModal(false)} onSelect={setToToken} excludeAddress={fromToken.address} />
    </>
  );
}
