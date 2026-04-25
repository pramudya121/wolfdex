import { useCallback, useEffect, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS, getTokenByAddress, type TokenInfo } from '@/config/contracts';
import { ERC20_ABI, FARMING_ABI } from '@/config/abis';

export interface PoolDecimals {
  staking: number;
  reward: number;
}

export interface FarmPool {
  pid: number;
  stakingToken: string;
  rewardToken: string;
  stakingSymbol: string;
  rewardSymbol: string;
  stakingLogo: string;
  rewardLogo: string;
  stakingDecimals: number;
  rewardDecimals: number;
  rewardPerBlock: string;        // formatted with rewardDecimals
  rewardPerBlockRaw: string;     // raw BN string
  totalStaked: string;           // formatted with stakingDecimals
  totalStakedRaw: string;
  lastRewardBlock: string;
  accRewardPerShare: string;
  /** Estimated APR % assuming reward token ≈ staking token in value (rough on-chain estimate). */
  apr: number;
  /** Reward emitted per day (formatted in reward decimals). */
  rewardPerDay: number;
}

export interface UserFarmInfo {
  pid: number;
  amount: string;          // formatted (staking decimals)
  amountRaw: string;
  pending: string;         // formatted (reward decimals)
  pendingRaw: string;
  walletBalance: string;   // staking-token wallet balance, formatted
  walletBalanceRaw: string;
  allowance: string;       // raw allowance to farming contract
}

const READ_PROVIDER = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);

function readContract(signer?: ethers.Signer | null) {
  return new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, signer ?? READ_PROVIDER);
}

async function safeDecimals(addr: string): Promise<number> {
  try {
    const known = getTokenByAddress(addr);
    if (known) return known.decimals;
    const erc = new ethers.Contract(addr, ERC20_ABI, READ_PROVIDER);
    return await erc.decimals();
  } catch { return 18; }
}

async function safeSymbol(addr: string): Promise<string> {
  const known = getTokenByAddress(addr);
  if (known) return known.symbol;
  try {
    const erc = new ethers.Contract(addr, ERC20_ABI, READ_PROVIDER);
    return await erc.symbol();
  } catch { return addr.slice(0, 6); }
}

/**
 * MasterChef-style farming hook for the Wolf farms.
 *
 * Pool length isn't exposed by the contract, so we discover pools by reading
 * poolInfo(i) until it reverts, then cache the count for the session.
 */
export function useFarming(signer: ethers.Signer | null, address: string | null) {
  const [pools, setPools] = useState<FarmPool[]>([]);
  const [userInfos, setUserInfos] = useState<Record<number, UserFarmInfo>>({});
  const [owner, setOwner] = useState<string | null>(null);
  const [loadingPools, setLoadingPools] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<{ pools: FarmPool[]; fetchedAt: number } | null>(null);
  // When > 0, all background polling intervals are skipped. Used by routes
  // (e.g. /portfolio) that want manual-refresh-only behavior.
  const [pausedCount, setPausedCount] = useState(0);
  const isPaused = pausedCount > 0;

  const loadPools = useCallback(async (force = false): Promise<FarmPool[]> => {
    if (!force && cacheRef.current && Date.now() - cacheRef.current.fetchedAt < 30_000) {
      setPools(cacheRef.current.pools);
      return cacheRef.current.pools;
    }
    setLoadingPools(true);
    try {
      const contract = readContract();
      const found: FarmPool[] = [];
      // Discover pool count by probing poolInfo until it reverts.
      // Cap at 100 to avoid runaway loops.
      for (let pid = 0; pid < 100; pid++) {
        try {
          const info = await contract.poolInfo(pid);
          const stakingAddr = info.stakingToken as string;
          const rewardAddr = info.rewardToken as string;
          const [sDec, rDec, sSym, rSym] = await Promise.all([
            safeDecimals(stakingAddr),
            safeDecimals(rewardAddr),
            safeSymbol(stakingAddr),
            safeSymbol(rewardAddr),
          ]);
          const sTok = getTokenByAddress(stakingAddr);
          const rTok = getTokenByAddress(rewardAddr);
          // ~2-second block time on LitVM testnet → 43,200 blocks/day, 15,768,000/year
          const SECONDS_PER_BLOCK = 2;
          const BLOCKS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_BLOCK;
          const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * 365;
          const rpb = parseFloat(ethers.utils.formatUnits(info.rewardPerBlock, rDec));
          const totalStakedNum = parseFloat(ethers.utils.formatUnits(info.totalStaked, sDec));
          const rewardPerDay = rpb * BLOCKS_PER_DAY;
          // Rough APR — assumes reward token ≈ staking token value (no oracle on-chain).
          const apr = totalStakedNum > 0 ? (rpb * BLOCKS_PER_YEAR / totalStakedNum) * 100 : 0;
          found.push({
            pid,
            stakingToken: stakingAddr,
            rewardToken: rewardAddr,
            stakingSymbol: sSym,
            rewardSymbol: rSym,
            stakingLogo: sTok?.logo ?? '/images/wdex-logo.png',
            rewardLogo: rTok?.logo ?? '/images/wdex-logo.png',
            stakingDecimals: sDec,
            rewardDecimals: rDec,
            rewardPerBlock: ethers.utils.formatUnits(info.rewardPerBlock, rDec),
            rewardPerBlockRaw: info.rewardPerBlock.toString(),
            totalStaked: ethers.utils.formatUnits(info.totalStaked, sDec),
            totalStakedRaw: info.totalStaked.toString(),
            lastRewardBlock: info.lastRewardBlock.toString(),
            accRewardPerShare: info.accRewardPerShare.toString(),
            apr,
            rewardPerDay,
          });
        } catch {
          // first revert means no more pools
          break;
        }
      }
      cacheRef.current = { pools: found, fetchedAt: Date.now() };
      setPools(found);
      return found;
    } finally { setLoadingPools(false); }
  }, []);

  const loadOwner = useCallback(async () => {
    try {
      const contract = readContract();
      const o = await contract.owner();
      setOwner(o);
    } catch { setOwner(null); }
  }, []);

  const loadUserInfo = useCallback(async (poolList?: FarmPool[]) => {
    if (!address) {
      setUserInfos({});
      return;
    }
    setLoadingUser(true);
    try {
      const list = poolList ?? pools;
      const contract = readContract();
      const out: Record<number, UserFarmInfo> = {};
      await Promise.all(list.map(async (pool) => {
        try {
          const erc = new ethers.Contract(pool.stakingToken, ERC20_ABI, READ_PROVIDER);
          const [info, pending, bal, allowance] = await Promise.all([
            contract.userInfo(pool.pid, address),
            contract.pendingReward(pool.pid, address),
            erc.balanceOf(address),
            erc.allowance(address, CONTRACTS.FARMING),
          ]);
          out[pool.pid] = {
            pid: pool.pid,
            amount: ethers.utils.formatUnits(info.amount, pool.stakingDecimals),
            amountRaw: info.amount.toString(),
            pending: ethers.utils.formatUnits(pending, pool.rewardDecimals),
            pendingRaw: pending.toString(),
            walletBalance: ethers.utils.formatUnits(bal, pool.stakingDecimals),
            walletBalanceRaw: bal.toString(),
            allowance: allowance.toString(),
          };
        } catch {
          out[pool.pid] = {
            pid: pool.pid, amount: '0', amountRaw: '0', pending: '0', pendingRaw: '0',
            walletBalance: '0', walletBalanceRaw: '0', allowance: '0',
          };
        }
      }));
      setUserInfos(out);
    } finally { setLoadingUser(false); }
  }, [address, pools]);

  // Initial load (read-only, runs even without wallet)
  useEffect(() => {
    loadPools().then(p => loadUserInfo(p));
    loadOwner();
  }, [loadPools, loadOwner]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Reload user info when address changes
  useEffect(() => {
    if (pools.length) loadUserInfo(pools);
  }, [address, pools, loadUserInfo]);

  // ===== AUTO-REFRESH POLLING =====
  // Poll user info (pending rewards, balances) every 12s while page visible.
  useEffect(() => {
    if (!address || pools.length === 0) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (isPaused) return;
      loadUserInfo(pools).catch(() => {});
    }, 12_000);
    return () => clearInterval(id);
  }, [address, pools, loadUserInfo, isPaused]);

  // Refresh pool stats (APR, total staked) every 45s.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (isPaused) return;
      loadPools(true).catch(() => {});
    }, 45_000);
    return () => clearInterval(id);
  }, [loadPools, isPaused]);

  // ===== WRITE ACTIONS =====
  const requireSigner = useCallback(() => {
    if (!signer) throw new Error('Wallet not connected');
    return signer;
  }, [signer]);

  const approve = useCallback(async (pool: FarmPool) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const erc = new ethers.Contract(pool.stakingToken, ERC20_ABI, s);
      const tx = await erc.approve(CONTRACTS.FARMING, ethers.constants.MaxUint256);
      await tx.wait();
      await loadUserInfo(pools);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Approve failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadUserInfo, pools]);

  const deposit = useCallback(async (pool: FarmPool, amount: string) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const parsed = ethers.utils.parseUnits(amount || '0', pool.stakingDecimals);
      const tx = await contract.deposit(pool.pid, parsed);
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Deposit failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  const withdraw = useCallback(async (pool: FarmPool, amount: string) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const parsed = ethers.utils.parseUnits(amount || '0', pool.stakingDecimals);
      const tx = await contract.withdraw(pool.pid, parsed);
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Withdraw failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  /** Harvest = deposit(pid, 0) — claims pending without changing stake. */
  const harvest = useCallback(async (pool: FarmPool) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const tx = await contract.deposit(pool.pid, 0);
      await tx.wait();
      await loadUserInfo(pools);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Harvest failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadUserInfo, pools]);

  const emergencyWithdraw = useCallback(async (pool: FarmPool) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const tx = await contract.emergencyWithdraw(pool.pid);
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Emergency withdraw failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  /**
   * Auto-compound: claims pending reward and re-stakes it.
   * Only works when rewardToken === stakingToken (single-token compound).
   * For dual-token pools, the UI should fall back to a manual harvest+swap flow.
   */
  const autoCompound = useCallback(async (pool: FarmPool): Promise<string> => {
    if (pool.stakingToken.toLowerCase() !== pool.rewardToken.toLowerCase()) {
      throw new Error('Auto-compound only available when reward token equals staking token');
    }
    const s = requireSigner();
    if (!address) throw new Error('Wallet not connected');
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      // 1. harvest (deposit 0 claims pending)
      const tx1 = await contract.deposit(pool.pid, 0);
      await tx1.wait();
      // 2. read fresh wallet balance of staking token
      const erc = new ethers.Contract(pool.stakingToken, ERC20_ABI, s);
      const bal: ethers.BigNumber = await erc.balanceOf(address);
      if (bal.isZero()) {
        await loadUserInfo(pools);
        return tx1.hash as string;
      }
      // 3. ensure allowance, then deposit the entire balance
      const allowance: ethers.BigNumber = await erc.allowance(address, CONTRACTS.FARMING);
      if (allowance.lt(bal)) {
        const apTx = await erc.approve(CONTRACTS.FARMING, ethers.constants.MaxUint256);
        await apTx.wait();
      }
      const tx2 = await contract.deposit(pool.pid, bal);
      await tx2.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx2.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Auto-compound failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, address, loadPools, loadUserInfo, pools]);

  // ===== ADMIN ACTIONS =====
  const isOwner = !!(owner && address && owner.toLowerCase() === address.toLowerCase());

  const addPool = useCallback(async (stakingToken: string, rewardToken: string, rewardPerBlock: string) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      // Use the reward token's decimals to interpret rewardPerBlock input.
      const rDec = await safeDecimals(rewardToken);
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const parsed = ethers.utils.parseUnits(rewardPerBlock || '0', rDec);
      const tx = await contract.addPool(stakingToken, rewardToken, parsed);
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Add pool failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  const updateRewardPerBlock = useCallback(async (pool: FarmPool, newRewardPerBlock: string) => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const parsed = ethers.utils.parseUnits(newRewardPerBlock || '0', pool.rewardDecimals);
      const tx = await contract.updateRewardPerBlock(pool.pid, parsed);
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Update reward failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  const massUpdate = useCallback(async () => {
    const s = requireSigner();
    setActionPending(true); setError(null);
    try {
      const contract = new ethers.Contract(CONTRACTS.FARMING, FARMING_ABI, s);
      const tx = await contract.massUpdatePools();
      await tx.wait();
      cacheRef.current = null;
      const fresh = await loadPools(true);
      await loadUserInfo(fresh);
      return tx.hash as string;
    } catch (e: any) {
      setError(e.reason || e.message || 'Mass update failed');
      throw e;
    } finally { setActionPending(false); }
  }, [requireSigner, loadPools, loadUserInfo]);

  return {
    pools, userInfos, owner, isOwner,
    loadingPools, loadingUser, actionPending, error,
    refresh: () => { cacheRef.current = null; return loadPools(true).then(p => loadUserInfo(p)); },
    approve, deposit, withdraw, harvest, emergencyWithdraw,
    addPool, updateRewardPerBlock, massUpdate,
    /** Increment pause counter. Returns a disposer that decrements it. */
    pausePolling: () => {
      setPausedCount(c => c + 1);
      return () => setPausedCount(c => Math.max(0, c - 1));
    },
  };
}

export type FarmingApi = ReturnType<typeof useFarming>;

// satisfy import linter for TokenInfo (used in types if extended later)
export type _Reserved = TokenInfo;
