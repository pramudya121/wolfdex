import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS, TOKENS } from '@/config/contracts';
import { type FarmPool, type FarmingApi } from '@/hooks/useFarming';
import { useDexContext } from '@/context/DexContext';
import BorderBeam from './ui/BorderBeam';
import ShimmerButton from './ui/ShimmerButton';

interface Props {
  isOpen?: boolean;
}

function formatNum(s: string, max = 6) {
  const n = parseFloat(s);
  if (!isFinite(n)) return '0';
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

function FarmCard({ pool, farming, allPools }: { pool: FarmPool; farming: FarmingApi; allPools: FarmPool[] }) {
  const { wallet, txHistory } = useDexContext();
  const user = farming.userInfos[pool.pid];
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  const [busy, setBusy] = useState<null | 'approve' | 'deposit' | 'withdraw' | 'harvest' | 'emergency' | 'compound'>(null);

  const amountRaw = (() => {
    try {
      return ethers.utils.parseUnits(amount || '0', pool.stakingDecimals);
    } catch { return ethers.BigNumber.from(0); }
  })();

  const allowanceBN = ethers.BigNumber.from(user?.allowance ?? '0');
  const stakedBN = ethers.BigNumber.from(user?.amountRaw ?? '0');
  const walletBN = ethers.BigNumber.from(user?.walletBalanceRaw ?? '0');
  const needsApprove = mode === 'stake' && amountRaw.gt(allowanceBN) && amountRaw.gt(0);

  // Boost multiplier — relative to median APR across all live pools
  const aprList = allPools.map(p => p.apr).filter(a => a > 0 && isFinite(a)).sort((a, b) => a - b);
  const median = aprList.length > 0 ? aprList[Math.floor(aprList.length / 2)] : 0;
  const boost = median > 0 && pool.apr > 0 ? pool.apr / median : 1;
  const boostTier = boost >= 2 ? { label: '🔥🔥 2x+', color: 'text-wolf-pink', bg: 'bg-wolf-pink/15 border-wolf-pink/40' }
                  : boost >= 1.3 ? { label: '🔥 BOOST', color: 'text-wolf-gold', bg: 'bg-wolf-gold/15 border-wolf-gold/40' }
                  : null;

  // Auto-compound is single-click only when reward token === staking token
  const canAutoCompound = pool.stakingToken.toLowerCase() === pool.rewardToken.toLowerCase()
                          && stakedBN.gt(0)
                          && parseFloat(user?.pending ?? '0') > 0;

  const max = () => {
    if (mode === 'stake') setAmount(user?.walletBalance ?? '0');
    else setAmount(user?.amount ?? '0');
  };

  type RunKind = NonNullable<typeof busy>;
  const KIND_TO_HISTORY: Record<RunKind, 'farm-stake' | 'farm-unstake' | 'farm-harvest' | 'farm-emergency' | 'approve' | 'farm-compound'> = {
    approve: 'approve', deposit: 'farm-stake', withdraw: 'farm-unstake',
    harvest: 'farm-harvest', emergency: 'farm-emergency', compound: 'farm-compound',
  };

  const run = async (op: () => Promise<string>, label: string, kind: RunKind, summary: string) => {
    if (!wallet.isConnected) { toast.error('Connect wallet first'); return; }
    setBusy(kind);
    const pendingId = `pending-${kind}-${Date.now()}`;
    // optimistic pending entry (replaced on hash)
    txHistory.add({
      hash: pendingId, kind: KIND_TO_HISTORY[kind], status: 'pending',
      summary: `${label}: ${summary}`, account: wallet.address || '', chainId: CHAIN_CONFIG.chainId,
    });
    const t = toast.loading(`${label} pending…`);
    try {
      const hash = await op();
      // swap pending placeholder for real hash
      txHistory.update(pendingId, { hash, status: 'success' });
      toast.success(`${label} success`, {
        id: t,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
      setAmount('');
    } catch (e: any) {
      txHistory.update(pendingId, { status: 'failed' });
      toast.error(`${label} failed`, { id: t, description: (e.reason || e.message || '').slice(0, 100) });
    } finally { setBusy(null); }
  };

  return (
    <BorderBeam rounded="rounded-2xl">
      <div className="wolf-pool-card rounded-2xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={pool.stakingLogo} alt="" className="w-10 h-10 rounded-full ring-2 ring-wolf-pink/40" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
              <img src={pool.rewardLogo} alt="" className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full ring-2 ring-wolf-dark" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
            </div>
            <div>
              <div className="font-bold text-base">Stake {pool.stakingSymbol}</div>
              <div className="text-[11px] text-muted-foreground">Earn {pool.rewardSymbol} · #{pool.pid}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {boostTier && (
              <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${boostTier.bg} ${boostTier.color}`}>
                {boostTier.label}
              </span>
            )}
            <span className="px-2 py-1 rounded-md bg-wolf-green/15 text-wolf-green text-[10px] font-bold uppercase tracking-wider">
              🔥 Live
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gradient-to-br from-wolf-green/15 to-wolf-green/5 rounded-lg p-2.5 border border-wolf-green/30 relative overflow-hidden">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wider flex items-center gap-1">
              APR
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-wolf-green opacity-60"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wolf-green"></span>
              </span>
            </div>
            <motion.div
              key={pool.apr.toFixed(2)}
              initial={{ opacity: 0.4, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="font-black text-lg text-wolf-green mt-0.5"
            >
              {pool.apr > 999_999 ? '∞' : pool.apr > 0 ? `${formatNum(pool.apr.toString(), 2)}%` : '—'}
            </motion.div>
          </div>
          <div className="bg-gradient-to-br from-wolf-gold/15 to-wolf-gold/5 rounded-lg p-2.5 border border-wolf-gold/30">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wider">Reward / Day</div>
            <div className="font-bold text-sm text-wolf-gold mt-0.5">
              {formatNum(pool.rewardPerDay.toString(), 4)} {pool.rewardSymbol}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wider">Total Staked</div>
            <div className="font-bold text-xs mt-0.5">{formatNum(pool.totalStaked, 4)}</div>
          </div>
          <div className="bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wider">Reward / Block</div>
            <div className="font-bold text-xs mt-0.5 text-wolf-gold">{formatNum(pool.rewardPerBlock, 6)}</div>
          </div>
          <div className="bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wider">Your Stake</div>
            <div className="font-bold text-xs mt-0.5 text-wolf-pink">{formatNum(user?.amount ?? '0', 4)}</div>
          </div>
        </div>

        {/* Pending reward */}
        <div className="rounded-xl p-3 mb-4 bg-gradient-to-r from-wolf-pink/10 via-wolf-gold/10 to-wolf-pink/10 border border-wolf-gold/20">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">🎁 Pending Reward</div>
              <div className="font-black text-lg wolf-gradient-text">
                {formatNum(user?.pending ?? '0', 8)} {pool.rewardSymbol}
              </div>
            </div>
            <button
              disabled={!wallet.isConnected || busy !== null || ethers.BigNumber.from(user?.pendingRaw ?? '0').isZero()}
              onClick={() => run(() => farming.harvest(pool), 'Harvest', 'harvest', `${formatNum(user?.pending ?? '0', 6)} ${pool.rewardSymbol}`)}
              className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'harvest' ? '...' : '🪙 Harvest'}
            </button>
          </div>
        </div>

        {/* Stake/unstake tabs */}
        <div className="inline-flex p-1 rounded-full bg-wolf-surface/60 border border-wolf-border/30 mb-3">
          {(['stake', 'unstake'] as const).map(t => (
            <button key={t} onClick={() => { setMode(t); setAmount(''); }}
              className={`relative px-4 py-1 rounded-full text-xs font-semibold transition-colors ${mode === t ? 'text-white' : 'text-muted-foreground'}`}
            >
              {mode === t && (
                <motion.span layoutId={`farm-tab-${pool.pid}`}
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-wolf-pink to-wolf-gold"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{t === 'stake' ? 'Stake' : 'Unstake'}</span>
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div className="rounded-xl bg-wolf-surface/40 border border-wolf-border/30 p-3 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{mode === 'stake' ? 'Stake amount' : 'Unstake amount'}</span>
            <button onClick={max} className="text-[10px] font-bold text-wolf-pink hover:underline">
              MAX: {formatNum(mode === 'stake' ? (user?.walletBalance ?? '0') : (user?.amount ?? '0'), 4)}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-lg font-bold outline-none"
            />
            <span className="text-xs font-medium text-muted-foreground">{pool.stakingSymbol}</span>
          </div>
        </div>

        {/* Action buttons */}
        {mode === 'stake' ? (
          needsApprove ? (
            <button
              disabled={busy !== null || !wallet.isConnected}
              onClick={() => run(() => farming.approve(pool), 'Approve', 'approve', pool.stakingSymbol)}
              className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {busy === 'approve' ? 'Approving…' : `Approve ${pool.stakingSymbol}`}
            </button>
          ) : (
            <button
              disabled={busy !== null || !wallet.isConnected || amountRaw.isZero() || amountRaw.gt(walletBN)}
              onClick={() => run(() => farming.deposit(pool, amount), 'Deposit', 'deposit', `${amount} ${pool.stakingSymbol}`)}
              className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {busy === 'deposit' ? 'Staking…' : amountRaw.gt(walletBN) ? 'Insufficient balance' : '🐺 Stake'}
            </button>
          )
        ) : (
          <div className="space-y-2">
            <button
              disabled={busy !== null || !wallet.isConnected || amountRaw.isZero() || amountRaw.gt(stakedBN)}
              onClick={() => run(() => farming.withdraw(pool, amount), 'Withdraw', 'withdraw', `${amount} ${pool.stakingSymbol}`)}
              className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {busy === 'withdraw' ? 'Withdrawing…' : amountRaw.gt(stakedBN) ? 'Exceeds staked' : 'Unstake'}
            </button>
            <button
              disabled={busy !== null || !wallet.isConnected || stakedBN.isZero()}
              onClick={() => run(() => farming.emergencyWithdraw(pool), 'Emergency withdraw', 'emergency', `${user?.amount ?? '0'} ${pool.stakingSymbol}`)}
              className="w-full py-2 rounded-xl text-[11px] font-medium bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-all disabled:opacity-50"
            >
              ⚠️ Emergency Withdraw (forfeits rewards)
            </button>
          </div>
        )}

        {/* Disclaimer */}
        <p className="mt-3 text-[9px] text-muted-foreground/80 leading-relaxed italic">
          ⓘ APR auto-refreshes every ~45s. Estimate assumes reward token ≈ staking token in value (no oracle on-chain) and constant emission. Real yield depends on total stake, reward price, and how long you stay staked.
        </p>

        {/* Footer link */}
        <div className="mt-3 pt-3 border-t border-wolf-border/20 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Staking: {pool.stakingToken.slice(0, 6)}…{pool.stakingToken.slice(-4)}</span>
          <a href={`${CHAIN_CONFIG.blockExplorer}/address/${CONTRACTS.FARMING}`} target="_blank" rel="noopener noreferrer"
            className="hover:text-wolf-pink transition-colors"
          >Contract ↗</a>
        </div>
      </div>
    </BorderBeam>
  );
}

function AdminPanel({ farming, onClose }: { farming: FarmingApi; onClose: () => void }) {
  const { wallet, txHistory } = useDexContext();
  const [tab, setTab] = useState<'add' | 'edit' | 'mass'>('add');
  // Add pool form
  const [stakingToken, setStakingToken] = useState('');
  const [rewardToken, setRewardToken] = useState('');
  const [rewardPerBlock, setRewardPerBlock] = useState('');
  // Edit form
  const [editPid, setEditPid] = useState<number | null>(farming.pools[0]?.pid ?? null);
  const [editReward, setEditReward] = useState('');

  const editingPool = farming.pools.find(p => p.pid === editPid);

  const run = async (op: () => Promise<string>, label: string, summary: string) => {
    const pendingId = `pending-admin-${Date.now()}`;
    txHistory.add({
      hash: pendingId, kind: 'farm-admin', status: 'pending',
      summary: `${label}: ${summary}`, account: wallet.address || '', chainId: CHAIN_CONFIG.chainId,
    });
    const t = toast.loading(`${label} pending…`);
    try {
      const hash = await op();
      txHistory.update(pendingId, { hash, status: 'success' });
      toast.success(`${label} success`, {
        id: t,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${hash}`, '_blank') },
      });
    } catch (e: any) {
      txHistory.update(pendingId, { status: 'failed' });
      toast.error(`${label} failed`, { id: t, description: (e.reason || e.message || '').slice(0, 120) });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="wolf-card rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-black wolf-gradient-text">⚙️ Farming Admin</h3>
            <p className="text-xs text-muted-foreground">Owner-only controls</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-wolf-surface/60 border border-wolf-border/30 mb-4">
          {([
            { k: 'add', label: '➕ Add Pool' },
            { k: 'edit', label: '✏️ Edit Pool' },
            { k: 'mass', label: '⚡ Mass Update' },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t.k ? 'bg-wolf-pink/20 text-wolf-pink' : 'text-muted-foreground'}`}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'add' && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Staking Token Address</label>
              <input value={stakingToken} onChange={e => setStakingToken(e.target.value)} placeholder="0x…"
                className="wolf-input w-full px-3 py-2 rounded-lg text-sm font-mono mt-1"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {TOKENS.filter(t => !t.isNative).map(t => (
                  <button key={t.address} onClick={() => setStakingToken(t.address)}
                    className="text-[10px] px-2 py-1 rounded-md bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40"
                  >{t.symbol}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reward Token Address</label>
              <input value={rewardToken} onChange={e => setRewardToken(e.target.value)} placeholder="0x…"
                className="wolf-input w-full px-3 py-2 rounded-lg text-sm font-mono mt-1"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {TOKENS.filter(t => !t.isNative).map(t => (
                  <button key={t.address} onClick={() => setRewardToken(t.address)}
                    className="text-[10px] px-2 py-1 rounded-md bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40"
                  >{t.symbol}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reward Per Block (in reward-token units)</label>
              <input value={rewardPerBlock} onChange={e => setRewardPerBlock(e.target.value)} placeholder="0.01" type="number"
                className="wolf-input w-full px-3 py-2 rounded-lg text-sm mt-1"
              />
            </div>
            <button
              disabled={farming.actionPending || !stakingToken || !rewardToken || !rewardPerBlock}
              onClick={() => run(() => farming.addPool(stakingToken, rewardToken, rewardPerBlock), 'Add pool', `${stakingToken.slice(0, 6)}…→${rewardToken.slice(0, 6)}… @ ${rewardPerBlock}/blk`)}
              className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {farming.actionPending ? 'Submitting…' : '➕ Add Pool'}
            </button>
          </div>
        )}

        {tab === 'edit' && (
          <div className="space-y-3">
            {farming.pools.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No pools to edit</p>
            ) : (
              <>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Pool</label>
                  <select value={editPid ?? ''} onChange={e => setEditPid(parseInt(e.target.value))}
                    className="wolf-input w-full px-3 py-2 rounded-lg text-sm mt-1"
                  >
                    {farming.pools.map(p => (
                      <option key={p.pid} value={p.pid}>#{p.pid} {p.stakingSymbol} → {p.rewardSymbol}</option>
                    ))}
                  </select>
                </div>
                {editingPool && (
                  <div className="text-[11px] text-muted-foreground bg-wolf-surface/40 rounded-lg p-2 border border-wolf-border/20">
                    Current rewardPerBlock: <span className="text-wolf-gold font-mono">{editingPool.rewardPerBlock}</span> {editingPool.rewardSymbol}
                  </div>
                )}
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">New Reward Per Block</label>
                  <input value={editReward} onChange={e => setEditReward(e.target.value)} placeholder="0.02" type="number"
                    className="wolf-input w-full px-3 py-2 rounded-lg text-sm mt-1"
                  />
                </div>
                <button
                  disabled={farming.actionPending || !editingPool || !editReward}
                  onClick={() => editingPool && run(() => farming.updateRewardPerBlock(editingPool, editReward), 'Update reward', `Pool #${editingPool.pid} → ${editReward} ${editingPool.rewardSymbol}/blk`)}
                  className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {farming.actionPending ? 'Updating…' : '💾 Update'}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'mass' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Recompute accumulated rewards across every pool. Useful before bulk reward changes.</p>
            <button
              disabled={farming.actionPending}
              onClick={() => run(() => farming.massUpdate(), 'Mass update', 'all pools')}
              className="w-full wolf-btn-primary py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
            >
              {farming.actionPending ? 'Updating…' : '⚡ Mass Update Pools'}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function FarmingView(_: Props) {
  const { wallet, farming } = useDexContext();
  const [showAdmin, setShowAdmin] = useState(false);

  const totalStaked = farming.pools.reduce((s, p) => s + parseFloat(p.totalStaked || '0'), 0);
  const userPending = Object.values(farming.userInfos).reduce((s, u) => s + parseFloat(u.pending || '0'), 0);
  const userStaked = Object.values(farming.userInfos).reduce((s, u) => s + parseFloat(u.amount || '0'), 0);
  const showSkeleton = farming.loadingPools && farming.pools.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-6xl mx-auto">
      {/* Title bar */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-1">🌾 Wolf Farms</h1>
          <p className="text-muted-foreground text-sm">Stake tokens, earn rewards every block</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => farming.refresh()}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-wolf-surface border border-wolf-border/30 hover:border-wolf-pink/40 transition-all"
          >🔄 Refresh</button>
          {farming.isOwner && (
            <ShimmerButton onClick={() => setShowAdmin(true)} className="text-xs px-4 py-2">
              ⚙️ Admin Panel
            </ShimmerButton>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { icon: '🌾', label: 'Active Farms', value: farming.pools.length.toString() },
          { icon: '🔒', label: 'Total Staked (sum)', value: formatNum(totalStaked.toString(), 2) },
          { icon: '💎', label: 'Your Total Stake', value: formatNum(userStaked.toString(), 4) },
          { icon: '🎁', label: 'Your Pending', value: formatNum(userPending.toString(), 6) },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="wolf-stat-card rounded-xl p-4"
          >
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className="text-base font-bold mt-0.5">{s.value}</div>
          </motion.div>
        ))}
      </div>

      {!wallet.isConnected && (
        <div className="wolf-card rounded-xl p-4 mb-5 text-center text-sm text-muted-foreground border border-wolf-pink/20">
          🦊 Connect your wallet to stake and harvest rewards
        </div>
      )}

      {farming.isOwner && (
        <div className="rounded-xl p-3 mb-5 bg-gradient-to-r from-wolf-gold/10 to-wolf-pink/10 border border-wolf-gold/30 text-xs flex items-center justify-between">
          <span>👑 You are the contract owner. Admin controls available.</span>
          <button onClick={() => setShowAdmin(true)} className="text-wolf-gold font-bold hover:underline">Open panel →</button>
        </div>
      )}

      {/* Pool grid */}
      {showSkeleton ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="wolf-pool-card rounded-2xl p-5 animate-pulse h-[420px]" />
          ))}
        </div>
      ) : farming.pools.length === 0 ? (
        <div className="wolf-card rounded-2xl p-12 text-center">
          <div className="text-5xl mb-3">🌱</div>
          <p className="font-bold text-lg">No farms live yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            {farming.isOwner ? 'Be the first — open the admin panel to add a pool.' : 'Check back soon — pools will appear here once added.'}
          </p>
          {farming.isOwner && (
            <button onClick={() => setShowAdmin(true)} className="wolf-btn-primary px-5 py-2 rounded-xl text-sm font-bold mt-4">
              ➕ Add First Pool
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {farming.pools.map(pool => (
            <FarmCard key={pool.pid} pool={pool} farming={farming} allPools={farming.pools} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdmin && farming.isOwner && (
          <AdminPanel farming={farming} onClose={() => setShowAdmin(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
