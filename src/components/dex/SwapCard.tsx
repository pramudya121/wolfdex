import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, NATIVE_TOKEN, isWrapUnwrap, isNativeToken, type TokenInfo, CONTRACTS, CHAIN_CONFIG, getTokenByAddress } from '@/config/contracts';
import { toast } from 'sonner';
import TokenModal from './TokenModal';
import TxSettingsPanel from './TxSettingsPanel';
import { useTxSettings, useDexContext } from '@/context/DexContext';
import { useAggregatorConfig } from '@/hooks/useAggregator';
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
  /** Pre-select the "pay with" token (defaults to native zkLTC). */
  initialFrom?: TokenInfo;
  /** Pre-select the "receive" token (defaults to wrapped native). */
  initialTo?: TokenInfo;
}

export default function SwapCard({ swap, getAmountsOut, getBestRoute, previewSwap, getTokenBalance, loading, txHash, error, isConnected, onConnectClick, initialFrom, initialTo }: SwapCardProps) {
  const { slippage, deadline } = useTxSettings();
  const [fromToken, setFromToken] = useState<TokenInfo>(initialFrom ?? NATIVE_TOKEN);
  const [toToken, setToToken] = useState<TokenInfo>(initialTo ?? TOKENS[1]);

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
    // Hard block on preflight errors so we don't burn gas on a guaranteed revert.
    if (preflight && preflight.errors.length > 0) {
      toast.error('Swap blocked', { description: preflight.errors[0] });
      return;
    }
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
        {rate && !wrapType && (() => {
          const impactColor = priceImpact >= 5 ? 'text-wolf-red' : priceImpact >= 1 ? 'text-yellow-400' : 'text-wolf-green';
          return (
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>1 {fromToken.symbol} = {rate} {toToken.symbol}</span>
              <span className={impactColor}>Impact {priceImpact < 0.01 ? '<0.01' : priceImpact.toFixed(2)}%</span>
            </div>
          );
        })()}

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

        {/* On-chain validation: errors */}
        {preflight && preflight.errors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl bg-wolf-red/10 border border-wolf-red/40 text-xs space-y-1"
          >
            <div className="flex items-center gap-2 font-semibold text-wolf-red">
              <span>⛔</span><span>Cannot swap</span>
            </div>
            {preflight.errors.map((e, i) => (
              <div key={i} className="text-wolf-red/90">• {e}</div>
            ))}
          </motion.div>
        )}

        {/* On-chain validation: warnings */}
        {preflight && preflight.errors.length === 0 && preflight.warnings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/40 text-xs space-y-1"
          >
            <div className="flex items-center gap-2 font-semibold text-yellow-400">
              <span>⚠️</span><span>Heads up</span>
            </div>
            {preflight.warnings.map((w, i) => (
              <div key={i} className="text-yellow-300/90">• {w}</div>
            ))}
          </motion.div>
        )}

        {/* High price-impact callout (always shown when impact ≥ 5%) */}
        {!wrapType && priceImpact >= 5 && (
          <div className="mt-3 p-2.5 rounded-xl bg-wolf-red/10 border border-wolf-red/40 text-xs text-wolf-red flex items-center gap-2">
            <span>🔥</span>
            <span>High price impact ({priceImpact.toFixed(2)}%) — your trade is large vs pool depth.</span>
          </div>
        )}

        {/* Trade details (now backed by preflight data) */}
        {fromAmount && toAmount && parseFloat(toAmount) > 0 && (
          <button onClick={() => setShowTradeDetails(!showTradeDetails)}
            className="mt-3 w-full flex items-center justify-between text-xs text-muted-foreground px-1 py-2 hover:text-foreground transition-colors"
          >
            <span>Trade details {previewing && '(checking on-chain…)'}</span>
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
                  <span className="text-foreground tabular-nums">
                    {preflight ? parseFloat(preflight.details.amountOutMin).toFixed(6) : (parseFloat(toAmount) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {toToken.symbol}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Slippage tolerance</span>
                  <span className="text-foreground">{slippage}% ({preflight?.details.slippageBips ?? Math.round(parseFloat(slippage) * 100)} bips)</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Price impact</span>
                  <span className={priceImpact >= 5 ? 'text-wolf-red' : priceImpact >= 1 ? 'text-yellow-400' : 'text-wolf-green'}>
                    {priceImpact < 0.01 ? '<0.01' : priceImpact.toFixed(2)}%
                  </span>
                </div>
                {route && route.spotPrice > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Spot vs execution</span>
                    <span className="text-foreground tabular-nums">
                      {route.spotPrice.toPrecision(5)} → {route.executionPrice.toPrecision(5)}
                    </span>
                  </div>
                )}
                {preflight && (
                  <>
                    <div className="border-t border-wolf-border/20 pt-2 mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">Tx request</div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Method</span>
                      <span className="text-foreground font-mono text-[10px]">{preflight.details.method}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Deadline</span>
                      <span className="text-foreground tabular-nums">
                        {new Date(preflight.details.deadline * 1000).toLocaleTimeString()} ({deadline}m)
                      </span>
                    </div>
                    {preflight.details.value !== '0' && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Value sent</span>
                        <span className="text-foreground tabular-nums">{parseFloat(preflight.details.value).toFixed(6)} zkLTC</span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Allowance</span>
                      <span className={preflight.details.needsApproval ? 'text-yellow-400' : 'text-wolf-green'}>
                        {preflight.details.needsApproval ? 'approval required' : 'sufficient'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Pool liquidity</span>
                      <span className={preflight.details.pairExists.every(Boolean) ? 'text-wolf-green' : 'text-wolf-red'}>
                        {preflight.details.pairExists.every(Boolean) ? `verified (${preflight.details.pairExists.length} hop${preflight.details.pairExists.length > 1 ? 's' : ''})` : 'missing'}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Estimated gas</span>
                      <span className="text-foreground tabular-nums">
                        {preflight.details.estimatedGas ? `${parseInt(preflight.details.estimatedGas).toLocaleString()} units` : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action button */}
        <button
          onClick={isConnected ? handleSwap : onConnectClick}
          disabled={isConnected && (loading || !fromAmount || parseFloat(fromAmount) <= 0 || !!(preflight && preflight.errors.length > 0))}
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
