import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ethers } from 'ethers';
import { TOKENS, CHAIN_CONFIG, getTokenByAddress, type TokenInfo } from '@/config/contracts';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Link } from '@tanstack/react-router';
import { useDexContext } from '@/context/DexContext';
import BorderBeam from './ui/BorderBeam';
import NumberTicker from './ui/NumberTicker';
import SendTokenModal from './SendTokenModal';
import { WolfSkeleton, WolfSkeletonOrb, WolfSkeletonCard } from './ui/WolfSkeleton';
import EmptyState from './ui/EmptyState';
import ChartTooltip from './ui/ChartTooltip';
import { usePortfolioPnL } from '@/hooks/usePortfolioPnL';

interface TokenBalance {
  token: TokenInfo;
  balance: string;
  value: number;
}

interface LPPosition {
  pairAddress: string;
  symbol0: string; symbol1: string;
  logo0: string; logo1: string;
  lpBalance: string;
  share: number;
}

const COLORS = ['#e040a0', '#f0b429', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4', '#f59e0b'];

export default function PortfolioView({
  address, isConnected,
}: {
  address: string | null;
  isConnected: boolean;
  getTokenBalance: (addr: string) => Promise<string>;
}) {
  const { wallet, dex, farming, setShowAgent, getCachedPairsWithInfo } = useDexContext();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [lpPositions, setLpPositions] = useState<LPPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [harvestBusy, setHarvestBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendInitToken, setSendInitToken] = useState<TokenInfo | undefined>(undefined);

  // Aggregate farm data
  const userFarmStakes = useMemo(() => farming.pools
    .map(p => ({ pool: p, info: farming.userInfos[p.pid] }))
    .filter(x => x.info && parseFloat(x.info.amount) > 0),
    [farming.pools, farming.userInfos]);

  const totalPendingByToken = useMemo(() => {
    const map: Record<string, { symbol: string; logo: string; total: number }> = {};
    for (const p of farming.pools) {
      const u = farming.userInfos[p.pid];
      if (!u) continue;
      const v = parseFloat(u.pending);
      if (!isFinite(v) || v <= 0) continue;
      const key = p.rewardToken.toLowerCase();
      if (!map[key]) map[key] = { symbol: p.rewardSymbol, logo: p.rewardLogo, total: 0 };
      map[key].total += v;
    }
    return Object.values(map);
  }, [farming.pools, farming.userInfos]);

  const totalFarmStake = useMemo(() => userFarmStakes.reduce((s, x) => s + parseFloat(x.info!.amount), 0), [userFarmStakes]);

  const harvestAll = useCallback(async () => {
    const harvestable = farming.pools.filter(p => {
      const u = farming.userInfos[p.pid];
      return u && ethers.BigNumber.from(u.pendingRaw).gt(0);
    });
    if (harvestable.length === 0) { toast.info('Nothing to harvest'); return; }
    setHarvestBusy(true);
    let ok = 0; let fail = 0;
    for (const pool of harvestable) {
      try { await farming.harvest(pool); ok++; }
      catch { fail++; }
    }
    setHarvestBusy(false);
    if (ok) toast.success(`Harvested ${ok} pool${ok > 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`);
    else if (fail) toast.error(`All ${fail} harvest(s) failed`);
  }, [farming]);

  const loadPortfolio = useCallback(async () => {
    if (!isConnected || !address) return;
    setLoading(true);
    try {
      // 1) Batched balances via Multicall (single RPC) — order preserved
      const addrs = TOKENS.map(t => t.address);
      const balsRaw = await dex.getMultipleBalances(addrs);
      const bals: TokenBalance[] = [];
      TOKENS.forEach((token, i) => {
        const bal = balsRaw[i] || '0';
        const b = parseFloat(bal);
        // Show every non-zero balance, no matter how small
        if (b > 0) bals.push({ token, balance: bal, value: b });
      });
      setBalances(bals);
      setTotalValue(bals.reduce((s, b) => s + b.value, 0));

      // 2) LP positions — reuse cached pair list (no extra factory probing)
      try {
        const cache = await getCachedPairsWithInfo();
        const pairAddrs = cache.pairs.slice(0, 30);
        const lpBals = await dex.getMultipleBalances(pairAddrs);
        const lps: LPPosition[] = [];
        pairAddrs.forEach((pairAddr, i) => {
          const lpBal = lpBals[i] || '0';
          const b = parseFloat(lpBal);
          if (b > 0) {
            const info = cache.infos[pairAddr];
            const tok0 = info ? getTokenByAddress(info.token0) : undefined;
            const tok1 = info ? getTokenByAddress(info.token1) : undefined;
            const totalSup = info ? parseFloat(info.totalSupply) : 0;
            lps.push({
              pairAddress: pairAddr,
              symbol0: tok0?.symbol || (info?.token0.slice(0, 6) ?? '?'),
              symbol1: tok1?.symbol || (info?.token1.slice(0, 6) ?? '?'),
              logo0: tok0?.logo || '/images/wdex-logo.png',
              logo1: tok1?.logo || '/images/wdex-logo.png',
              lpBalance: lpBal, share: totalSup > 0 ? (b / totalSup) * 100 : 0,
            });
          }
        });
        setLpPositions(lps);
      } catch {}
    } catch (e) {
      console.error('[Portfolio] load failed', e);
    } finally { setLoading(false); }
  }, [isConnected, address, dex, getCachedPairsWithInfo]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // ===== Disable auto-refresh while on Portfolio =====
  // User explicitly asked: portfolio should be manual-refresh only.
  // We pause the global farming polling on mount and resume on unmount.
  useEffect(() => {
    const resume = farming.pausePolling();
    return () => { resume(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pnl = usePortfolioPnL(address);
  // Real equity history derived from on-chain swap tx history. Falls back
  // to a flat baseline at totalValue when the user has no swaps yet so the
  // chart still renders cleanly.
  const historyData = useMemo(() => {
    if (pnl.equityHistory.length > 0) {
      return pnl.equityHistory.map(p => ({ date: p.date, value: +(totalValue + p.value).toFixed(4) }));
    }
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i));
      return { date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: +totalValue.toFixed(4) };
    });
  }, [pnl.equityHistory, totalValue]);

  const tokenPieData = balances.map(b => ({ name: b.token.symbol, value: b.value }));
  const lpPieData = lpPositions.map(lp => ({ name: `${lp.symbol0}/${lp.symbol1}`, value: parseFloat(lp.lpBalance) }));
  const shortAddr = address ? `${address.slice(0, 8)}...${address.slice(-6)}` : '';

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto pt-6">
        <EmptyState
          emoji="🐺"
          title="Wake the Pack"
          description="Connect your wallet to summon the wolves and unlock your portfolio — tokens, LP positions, farms and PnL all in one den."
          actions={
            <button onClick={() => wallet.connect?.()} className="wolf-btn-primary px-5 py-2.5 rounded-xl text-sm font-bold wolf-shimmer-hover">
              🔗 Connect Wallet
            </button>
          }
        />
      </div>
    );
  }

  const hasNoActivity = balances.length === 0 && lpPositions.length === 0 && userFarmStakes.length === 0 && totalPendingByToken.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-1">Portfolio</h1>
        <p className="text-muted-foreground text-sm">Your tokens and liquidity positions</p>
      </div>

      {/* Pending rewards (real, aggregated from all farms) */}
      <div className="wolf-card rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xl">🎁</span>
          <div>
            <div className="text-xs text-muted-foreground">Total Pending Rewards</div>
            {totalPendingByToken.length === 0 ? (
              <div className="font-bold text-sm text-muted-foreground">No pending rewards</div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-1">
                {totalPendingByToken.map(t => (
                  <span key={t.symbol} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-wolf-surface/60 border border-wolf-border/30 text-xs font-bold">
                    <img src={t.logo} alt="" className="w-4 h-4 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    {t.total.toLocaleString(undefined, { maximumFractionDigits: 6 })} {t.symbol}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button
          disabled={harvestBusy || totalPendingByToken.length === 0}
          onClick={harvestAll}
          className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {harvestBusy ? 'Harvesting…' : '🪙 Harvest All'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <BorderBeam className="col-span-2 lg:col-span-1" rounded="rounded-xl">
          <div className="wolf-stat-card rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">💰 Portfolio Value</div>
            <div className="text-2xl font-black mt-1">
              <NumberTicker value={totalValue} prefix="$" decimals={4} />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{shortAddr}</span>
              <button onClick={() => navigator.clipboard.writeText(address || '')} className="hover:text-foreground">📋</button>
            </div>
            <button onClick={loadPortfolio} className="text-xs text-wolf-pink hover:underline mt-1">🔄 Refresh</button>
          </div>
        </BorderBeam>
        {[
          { icon: '🪙', label: 'Tokens', num: balances.length, isNum: true },
          { icon: '📈', label: `PnL (${pnl.tradeCount} trades)`, num: pnl.realizedTotal, isNum: true, signed: true },
          { icon: '🌾', label: 'Farming', num: 0, value: '$0.00' },
        ].map(s => (
          <BorderBeam key={s.label} rounded="rounded-xl">
            <div className="wolf-stat-card rounded-xl p-4">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className={`text-lg font-bold mt-0.5 ${s.signed ? (s.num > 0 ? 'text-wolf-green' : s.num < 0 ? 'text-destructive' : '') : ''}`}>
                {s.isNum ? <NumberTicker value={s.num} prefix={s.signed && s.num > 0 ? '+' : ''} decimals={s.signed ? 4 : 0} /> : s.value}
              </div>
            </div>
          </BorderBeam>
        ))}
      </div>

      {/* Asset breakdown */}
      <div className="mb-6">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Asset Breakdown</h3>
        <div className="flex gap-3 text-xs flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#e040a0' }} /> Tokens {balances.length > 0 ? '100' : '0'}%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#f0b429' }} /> Liquidity {lpPositions.length > 0 ? '~' : '0'}%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#10b981' }} /> Staking 0%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#8b5cf6' }} /> Farming 0%</span>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-6 py-16">
          <WolfSkeletonOrb />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 w-full">
            <WolfSkeleton className="h-44 w-full" />
            <WolfSkeleton className="h-44 w-full" />
            <WolfSkeleton className="h-44 w-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
            <WolfSkeletonCard className="wolf-card rounded-xl" />
            <WolfSkeletonCard className="wolf-card rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="wolf-card rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">📈 Portfolio History</h3>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#888' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#888' }} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#portGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="wolf-card rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">🍩 Token Allocation</h3>
              {tokenPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={tokenPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {tokenPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-10 text-sm">No tokens</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {tokenPieData.slice(0, 5).map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} /> {d.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="wolf-card rounded-xl p-4">
              <h3 className="font-bold text-sm mb-3">🍩 LP Allocation</h3>
              {lpPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={lpPieData} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {lpPieData.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-10 text-sm">No LP positions</p>}
              <div className="flex flex-wrap gap-2 mt-2">
                {lpPieData.slice(0, 5).map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px]">
                    <span className="w-2 h-2 rounded-full" style={{ background: COLORS[(i + 3) % COLORS.length] }} /> {d.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Token balances & Quick actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="wolf-card rounded-xl p-4 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">🪙 Token Balances</h3>
                <button onClick={loadPortfolio} className="text-xs text-muted-foreground hover:text-foreground">🔄</button>
              </div>
              <div className="space-y-1">
                {balances.length > 0 ? balances.map(b => (
                  <div key={b.token.address} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-wolf-surface/50 transition-all border-b border-wolf-border/10 last:border-0 group">
                    <div className="flex items-center gap-3">
                      <img src={b.token.logo} alt="" className="w-8 h-8 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                      <div>
                        <div className="font-medium text-sm">{b.token.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">{b.token.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-bold text-sm">{parseFloat(b.balance).toFixed(4)}</div>
                        <div className="text-[10px] text-muted-foreground">${b.value.toFixed(4)}</div>
                      </div>
                      <button
                        onClick={() => { setSendInitToken(b.token); setSendOpen(true); }}
                        className="opacity-60 group-hover:opacity-100 px-2 py-1 rounded-md text-[10px] font-bold bg-wolf-pink/10 text-wolf-pink border border-wolf-pink/30 hover:bg-wolf-pink/20 transition-all"
                        title={`Send ${b.token.symbol}`}
                      >📤 Send</button>
                    </div>
                  </div>
                )) : <p className="text-center text-muted-foreground py-8 text-sm">No tokens found</p>}
              </div>
            </div>
            <div className="space-y-4">
              <div className="wolf-card rounded-xl p-4">
                <h3 className="font-bold text-sm mb-3">🏆 Airdrop Rank</h3>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black" style={{ background: 'linear-gradient(135deg, #e040a0, #8b5cf6)', border: '2px solid #e040a0' }}>🐺</div>
                  <div>
                    <div className="font-medium text-sm">{shortAddr}</div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(224,64,160,0.2)', color: '#e040a0' }}>#? Silver</span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Progress to Gold</span><span>0%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-wolf-dark overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: '0%', background: '#e040a0' }} />
                  </div>
                </div>
              </div>
              <div className="wolf-card rounded-xl p-4">
                <h3 className="font-bold text-sm mb-3">⚡ Quick Actions</h3>
                <div className="space-y-2">
                  <button onClick={() => { setSendInitToken(undefined); setSendOpen(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-wolf-pink/15 to-wolf-gold/15 hover:from-wolf-pink/25 hover:to-wolf-gold/25 border border-wolf-pink/30 transition-all text-sm font-medium"
                  >📤 Send Token</button>
                  <button onClick={() => setShowAgent(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all text-sm"
                  >🤖 Ask AI Trader</button>
                  <Link to="/swap" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all text-sm">🔄 Swap Tokens</Link>
                  <Link to="/liquidity" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all text-sm">💧 Add Liquidity</Link>
                  <Link to="/pools" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all text-sm">🏊 View Pools</Link>
                  <Link to="/farming" className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all text-sm">🌾 Farms</Link>
                </div>
              </div>
            </div>
          </div>

          {/* My Farm Stakes — auto-refreshes via shared farming context */}
          <div className="wolf-card rounded-xl p-4 mt-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-sm flex items-center gap-2">🌾 My Farm Stakes
                {userFarmStakes.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-wolf-pink/20 text-wolf-pink">{userFarmStakes.length}</span>}
                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider text-wolf-green">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wolf-green opacity-60"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wolf-green"></span>
                  </span>
                  Live
                </span>
              </h3>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>Total staked: <span className="text-foreground font-bold">{totalFarmStake.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span></span>
                <button onClick={() => farming.refresh()} className="hover:text-foreground" title="Refresh now">🔄</button>
                <Link to="/farming" className="text-wolf-pink hover:underline font-medium">Open farms →</Link>
              </div>
            </div>
            {userFarmStakes.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">You haven't staked in any farm yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {userFarmStakes.map(({ pool, info }) => (
                  <div key={pool.pid} className="rounded-xl p-3 bg-wolf-surface/40 border border-wolf-border/20 hover:border-wolf-pink/30 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <img src={pool.stakingLogo} alt="" className="w-7 h-7 rounded-full ring-1 ring-wolf-pink/30" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                          <img src={pool.rewardLogo} alt="" className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-1 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                        </div>
                        <div>
                          <div className="font-bold text-xs">{pool.stakingSymbol} → {pool.rewardSymbol}</div>
                          <div className="text-[9px] text-muted-foreground">Pool #{pool.pid} · APR {pool.apr > 999_999 ? '∞' : pool.apr.toFixed(2)}%</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-wolf-green/15 text-wolf-green text-[9px] font-bold uppercase">Active</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">Staked</div>
                        <div className="font-bold">{parseFloat(info!.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} {pool.stakingSymbol}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase text-muted-foreground">Pending</div>
                        <div className="font-bold text-wolf-gold">{parseFloat(info!.pending).toLocaleString(undefined, { maximumFractionDigits: 6 })} {pool.rewardSymbol}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <SendTokenModal open={sendOpen} onClose={() => setSendOpen(false)} initialToken={sendInitToken} />
    </motion.div>
  );
}
