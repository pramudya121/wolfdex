import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TOKENS, NATIVE_TOKEN, CONTRACTS, type TokenInfo, CHAIN_CONFIG, getTokenByAddress, isNativeToken } from '@/config/contracts';
import { toast } from 'sonner';
import TokenModal from './TokenModal';
import TxSettingsPanel from './TxSettingsPanel';
import { useTxSettings } from '@/context/DexContext';

interface LiquidityPanelProps {
  addLiquidity: (a: TokenInfo, b: TokenInfo, amtA: string, amtB: string, slippagePct?: number, deadlineMinutes?: number) => Promise<string>;
  removeLiquidity: (a: TokenInfo, b: TokenInfo, liq: string, pair: string, slippagePct?: number, deadlineMinutes?: number) => Promise<string>;
  getTokenBalance: (addr: string) => Promise<string>;
  getPairAddress: (a: string, b: string) => Promise<string>;
  getPairInfo: (addr: string) => Promise<any>;
  loading: boolean;
  txHash: string | null;
  error: string | null;
  isConnected: boolean;
  onConnectClick: () => void;
  /** Pre-select the paired token (e.g. deep link from Market / token detail). */
  initialTokenB?: TokenInfo;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

export default function LiquidityPanel({ addLiquidity, removeLiquidity, getTokenBalance, getPairAddress, getPairInfo, loading, txHash, error, isConnected, onConnectClick, initialTokenB }: LiquidityPanelProps) {
  const { slippage, deadline, expertMode } = useTxSettings();
  const [tab, setTab] = useState<'add' | 'remove'>('add');
  const [tokenA, setTokenA] = useState<TokenInfo>(NATIVE_TOKEN);
  const [tokenB, setTokenB] = useState<TokenInfo>(initialTokenB ?? TOKENS[2]);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [liquidity, setLiquidity] = useState('');
  const [removePct, setRemovePct] = useState<number | null>(null);
  const [balA, setBalA] = useState('0');
  const [balB, setBalB] = useState('0');
  const [pairAddress, setPairAddress] = useState('');
  const [pairInfo, setPairInfo] = useState<any>(null);
  const [lpBalance, setLpBalance] = useState('0');
  const [showModalA, setShowModalA] = useState(false);
  const [showModalB, setShowModalB] = useState(false);
  const [lastEdited, setLastEdited] = useState<'A' | 'B' | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadData = useCallback(async () => {
    if (!isConnected) return;
    const [bA, bB] = await Promise.all([getTokenBalance(tokenA.address), getTokenBalance(tokenB.address)]);
    setBalA(bA); setBalB(bB);
    const pair = await getPairAddress(tokenA.address, tokenB.address);
    setPairAddress(pair);
    if (pair && pair !== ZERO_ADDR) {
      const info = await getPairInfo(pair);
      setPairInfo(info);
      const lpBal = await getTokenBalance(pair);
      setLpBalance(lpBal);
    } else {
      setPairInfo(null);
      setLpBalance('0');
    }
  }, [isConnected, tokenA, tokenB, getTokenBalance, getPairAddress, getPairInfo]);

  useEffect(() => { loadData(); }, [loadData]);

  // ===== Proportional Calculation: pool ratio (reserveA per reserveB) =====
  const ratio = useMemo(() => {
    if (!pairInfo) return null;
    const wethAddr = CONTRACTS.WETH.toLowerCase();
    const aOnChain = isNativeToken(tokenA.address) ? wethAddr : tokenA.address.toLowerCase();
    const t0 = pairInfo.token0.toLowerCase();
    const reserveA = aOnChain === t0 ? parseFloat(pairInfo.reserve0) : parseFloat(pairInfo.reserve1);
    const reserveB = aOnChain === t0 ? parseFloat(pairInfo.reserve1) : parseFloat(pairInfo.reserve0);
    if (!reserveA || !reserveB) return null;
    return { aPerB: reserveA / reserveB, bPerA: reserveB / reserveA, reserveA, reserveB };
  }, [pairInfo, tokenA.address]);

  // Auto-fill Token B when A changes (and pool exists)
  useEffect(() => {
    if (tab !== 'add' || lastEdited !== 'A' || !ratio || !amountA) return;
    const v = parseFloat(amountA);
    if (!isNaN(v) && v > 0) {
      setAmountB((v * ratio.bPerA).toFixed(6));
    } else if (amountA === '') {
      setAmountB('');
    }
  }, [amountA, ratio, lastEdited, tab]);

  // Auto-fill Token A when B changes (and pool exists)
  useEffect(() => {
    if (tab !== 'add' || lastEdited !== 'B' || !ratio || !amountB) return;
    const v = parseFloat(amountB);
    if (!isNaN(v) && v > 0) {
      setAmountA((v * ratio.aPerB).toFixed(6));
    } else if (amountB === '') {
      setAmountA('');
    }
  }, [amountB, ratio, lastEdited, tab]);

  // ===== Position Manager: estimate share & expected token-out for remove =====
  const expectedRemove = useMemo(() => {
    if (!pairInfo || !liquidity) return null;
    const liq = parseFloat(liquidity);
    const total = parseFloat(pairInfo.totalSupply);
    if (!liq || !total) return null;
    const share = liq / total;
    const wethAddr = CONTRACTS.WETH.toLowerCase();
    const aOnChain = isNativeToken(tokenA.address) ? wethAddr : tokenA.address.toLowerCase();
    const t0 = pairInfo.token0.toLowerCase();
    const reserveA = aOnChain === t0 ? parseFloat(pairInfo.reserve0) : parseFloat(pairInfo.reserve1);
    const reserveB = aOnChain === t0 ? parseFloat(pairInfo.reserve1) : parseFloat(pairInfo.reserve0);
    return { outA: reserveA * share, outB: reserveB * share, share: share * 100 };
  }, [pairInfo, liquidity, tokenA.address]);

  // ===== Price Impact: how far user inputs deviate from pool ratio =====
  const priceImpact = useMemo(() => {
    if (!ratio || !amountA || !amountB) return null;
    const a = parseFloat(amountA);
    const b = parseFloat(amountB);
    if (!a || !b) return null;
    const userRatio = b / a;                  // tokenB per tokenA from user input
    const poolRatio = ratio.bPerA;            // tokenB per tokenA from pool
    const deviation = Math.abs(userRatio - poolRatio) / poolRatio * 100;
    return deviation;
  }, [ratio, amountA, amountB]);

  const handleAdd = async () => {
    if (!amountA || !amountB) return;
    try {
      const hash = await addLiquidity(tokenA, tokenB, amountA, amountB, parseFloat(slippage), parseFloat(deadline));
      toast.success('Liquidity added!', {
        description: `${amountA} ${tokenA.symbol} + ${amountB} ${tokenB.symbol}`,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
      setAmountA(''); setAmountB('');
      loadData();
    } catch (e: any) {
      toast.error('Add liquidity failed', { description: e.reason || e.message });
    }
  };

  const handleRemove = async () => {
    if (!liquidity || !pairAddress) return;
    try {
      const hash = await removeLiquidity(tokenA, tokenB, liquidity, pairAddress, parseFloat(slippage), parseFloat(deadline));
      toast.success('Liquidity removed!', {
        description: `Removed ${liquidity} LP tokens`,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
      setLiquidity(''); setRemovePct(null);
      loadData();
    } catch (e: any) {
      toast.error('Remove liquidity failed', { description: e.reason || e.message });
    }
  };

  const setRemovePercent = (pct: number) => {
    setRemovePct(pct);
    const lp = parseFloat(lpBalance);
    if (!lp) return;
    const amt = (lp * pct / 100).toFixed(6);
    setLiquidity(amt);
  };

  const poolActive = pairInfo && pairAddress !== ZERO_ADDR;
  const t0Info = pairInfo ? getTokenByAddress(pairInfo.token0) : null;
  const t1Info = pairInfo ? getTokenByAddress(pairInfo.token1) : null;

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="wolf-card rounded-2xl p-5 w-full max-w-lg mx-auto wolf-glow overflow-hidden"
      >
        {/* Tabs + settings */}
        <div className="flex items-center gap-2 mb-5">
          <div className="flex flex-1 bg-wolf-dark/50 rounded-xl p-1">
            <button onClick={() => setTab('add')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${tab === 'add' ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40' : 'text-muted-foreground border border-transparent'}`}
            >+ Add Liquidity</button>
            <button onClick={() => setTab('remove')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${tab === 'remove' ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40' : 'text-muted-foreground border border-transparent'}`}
            >− Remove Liquidity</button>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2.5 rounded-xl bg-wolf-dark/50 hover:bg-wolf-surface border border-wolf-border/30 text-muted-foreground hover:text-wolf-pink transition-all"
            aria-label="Slippage settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>

        {/* Global tx settings (slippage + deadline, synced with SwapCard) */}
        <TxSettingsPanel open={showSettings} />

        {tab === 'add' ? (
          <>
            {/* Token A */}
            <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20 mb-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span className="uppercase tracking-wider font-medium">Token A</span>
                <span>Balance: <button onClick={() => { setLastEdited('A'); setAmountA(balA); }} className="text-wolf-pink font-semibold">{parseFloat(balA).toFixed(4)} <span className="text-wolf-gold">MAX</span></button></span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountA} onChange={e => { setLastEdited('A'); setAmountA(e.target.value); }}
                  placeholder="0.0" className="flex-1 bg-transparent text-xl font-bold outline-none min-w-0"
                />
                <button onClick={() => setShowModalA(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 shrink-0 transition-all"
                >
                  <img src={tokenA.logo} alt={tokenA.symbol} className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="font-semibold text-sm">{tokenA.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              </div>
            </div>

            <div className="flex justify-center -my-1 relative z-10">
              <div className="w-8 h-8 rounded-lg bg-wolf-surface border border-wolf-border/40 flex items-center justify-center text-wolf-pink font-bold">+</div>
            </div>

            {/* Token B */}
            <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20 mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span className="uppercase tracking-wider font-medium">Token B {ratio && <span className="text-wolf-green/80 normal-case ml-1">• auto</span>}</span>
                <span>Balance: <button onClick={() => { setLastEdited('B'); setAmountB(balB); }} className="text-wolf-pink font-semibold">{parseFloat(balB).toFixed(4)} <span className="text-wolf-gold">MAX</span></button></span>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" value={amountB} onChange={e => { setLastEdited('B'); setAmountB(e.target.value); }}
                  placeholder="0.0" className="flex-1 bg-transparent text-xl font-bold outline-none min-w-0"
                />
                <button onClick={() => setShowModalB(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 shrink-0 transition-all"
                >
                  <img src={tokenB.logo} alt={tokenB.symbol} className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="font-semibold text-sm">{tokenB.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              </div>
            </div>

            {/* AMM ratio readout */}
            {ratio && (
              <div className="rounded-xl bg-wolf-dark/40 p-3 border border-wolf-border/15 mb-3 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Pool Ratio</span>
                  <span className="text-foreground">1 {tokenA.symbol} ≈ {ratio.bPerA.toFixed(6)} {tokenB.symbol}</span>
                </div>
                <div className="flex justify-between text-muted-foreground mt-1">
                  <span>Inverse</span>
                  <span className="text-foreground">1 {tokenB.symbol} ≈ {ratio.aPerB.toFixed(6)} {tokenA.symbol}</span>
                </div>
              </div>
            )}

            {/* Price impact warning — hidden in expert mode */}
            {!expertMode && priceImpact !== null && priceImpact > 1 && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl p-3 mb-3 text-xs flex items-start gap-2 border ${
                  priceImpact > 10
                    ? 'bg-destructive/10 border-destructive/40 text-destructive'
                    : priceImpact > 5
                    ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-500'
                    : 'bg-wolf-gold/10 border-wolf-gold/30 text-wolf-gold'
                }`}
              >
                <span className="text-base leading-none">{priceImpact > 10 ? '🚨' : '⚠'}</span>
                <div className="flex-1">
                  <div className="font-semibold mb-0.5">
                    {priceImpact > 10 ? 'High price impact' : priceImpact > 5 ? 'Notable price impact' : 'Slight price deviation'} (~{priceImpact.toFixed(2)}%)
                  </div>
                  <div className="opacity-80">
                    Your input ratio differs from the pool ratio. The router will only accept the smaller paired amount and refund the rest.
                  </div>
                </div>
              </motion.div>
            )}
          </>
        ) : (
          <>
            {/* ===== REMOVE LIQUIDITY UI (matches screenshot) ===== */}
            {/* LP Balance card */}
            <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20 mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Your LP Tokens</span>
                <span className="text-2xl font-black text-foreground">{parseFloat(lpBalance).toFixed(6)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="flex -space-x-1.5">
                  <img src={(t0Info?.logo || tokenA.logo)} alt="" className="w-4 h-4 rounded-full ring-1 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <img src={(t1Info?.logo || tokenB.logo)} alt="" className="w-4 h-4 rounded-full ring-1 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <span>{(t0Info?.symbol || tokenA.symbol)}/{(t1Info?.symbol || tokenB.symbol)} LP</span>
              </div>
            </div>

            {/* Pair selector row */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Token A</div>
                <button onClick={() => setShowModalA(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all"
                >
                  <img src={tokenA.logo} alt={tokenA.symbol} className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="font-semibold text-sm flex-1 text-left">{tokenA.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1.5">Token B</div>
                <button onClick={() => setShowModalB(true)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-all"
                >
                  <img src={tokenB.logo} alt={tokenB.symbol} className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <span className="font-semibold text-sm flex-1 text-left">{tokenB.symbol}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 9l6 6 6-6"/></svg>
                </button>
              </div>
            </div>

            {/* Amount to remove */}
            <div className="rounded-xl bg-wolf-dark/60 p-4 border border-wolf-border/20 mb-3">
              <div className="flex justify-between text-xs mb-2">
                <span className="uppercase tracking-wider font-medium text-muted-foreground">Amount To Remove</span>
                <button onClick={() => setRemovePercent(100)} className="text-wolf-pink font-bold text-xs">MAX</button>
              </div>
              <input
                type="number"
                value={liquidity}
                onChange={e => { setRemovePct(null); setLiquidity(e.target.value); }}
                placeholder="0.0"
                className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/40"
              />
            </div>

            {/* Percentage buttons */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[25, 50, 75, 100].map(pct => (
                <button
                  key={pct}
                  onClick={() => setRemovePercent(pct)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                    removePct === pct
                      ? 'bg-wolf-pink/20 text-wolf-pink border-wolf-pink/50'
                      : 'bg-wolf-dark/60 border-wolf-border/30 text-foreground hover:bg-wolf-surface-hover'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            {/* Auto-calculated expected output (Position Manager) */}
            {expectedRemove && (
              <div className="rounded-xl bg-wolf-dark/40 p-3 border border-wolf-border/15 mb-3 space-y-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">You Will Receive</div>
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <img src={tokenA.logo} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span>{tokenA.symbol}</span>
                  </div>
                  <span className="font-bold text-wolf-green">{expectedRemove.outA.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <img src={tokenB.logo} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span>{tokenB.symbol}</span>
                  </div>
                  <span className="font-bold text-wolf-green">{expectedRemove.outB.toFixed(6)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground border-t border-wolf-border/20 pt-1.5 mt-1">
                  <span>Pool share</span>
                  <span>{expectedRemove.share.toFixed(4)}%</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Pool info — only on Add tab */}
        {tab === 'add' && (
          <div className="rounded-xl bg-wolf-dark/40 p-4 border border-wolf-border/15 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Pool Information</span>
              <div className="flex items-center gap-1.5">
                {poolActive ? (
                  <span className="flex items-center gap-1 text-xs text-wolf-green font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-wolf-green" /> Active Pool
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-yellow-500 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" /> No Pool
                  </span>
                )}
              </div>
            </div>
            {poolActive && pairInfo && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={t0Info?.logo || tokenA.logo} alt="" className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-sm">{t0Info?.symbol || tokenA.symbol}</span>
                  </div>
                  <span className="text-sm font-bold">{parseFloat(pairInfo.reserve0).toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={t1Info?.logo || tokenB.logo} alt="" className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span className="text-sm">{t1Info?.symbol || tokenB.symbol}</span>
                  </div>
                  <span className="text-sm font-bold">{parseFloat(pairInfo.reserve1).toFixed(4)}</span>
                </div>
                <div className="border-t border-wolf-border/20 pt-2 mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Your LP</span>
                    <span className="text-wolf-gold font-medium">{parseFloat(lpBalance).toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Total Supply</span>
                    <span>{parseFloat(pairInfo.totalSupply).toFixed(4)}</span>
                  </div>
                </div>
              </div>
            )}
            {!poolActive && (
              <p className="text-xs text-muted-foreground text-center py-2">Be the first to add liquidity for this pair</p>
            )}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={isConnected ? (tab === 'add' ? handleAdd : handleRemove) : onConnectClick}
          disabled={isConnected && (loading || (tab === 'add' ? (!amountA || !amountB) : !liquidity))}
          className="w-full py-4 rounded-2xl font-bold text-base wolf-btn-primary disabled:opacity-50 text-lg"
        >
          {!isConnected ? 'Connect Wallet' : loading ? 'Processing...' : tab === 'add' ? 'Add Liquidity' : 'Remove Liquidity'}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <button onClick={loadData} className="flex items-center gap-1 hover:text-foreground transition-colors">
            🔄 Refresh
          </button>
        </div>

        {txHash && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-sm">
            <span className="text-green-400">✓ Success!</span>
            <a href={`${CHAIN_CONFIG.blockExplorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-wolf-gold hover:underline mt-1 truncate">View on Explorer →</a>
          </motion.div>
        )}
        {error && <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive">{error}</div>}
      </motion.div>

      <TokenModal isOpen={showModalA} onClose={() => setShowModalA(false)} onSelect={setTokenA} excludeAddress={tokenB.address} />
      <TokenModal isOpen={showModalB} onClose={() => setShowModalB(false)} onSelect={setTokenB} excludeAddress={tokenA.address} />
    </>
  );
}
