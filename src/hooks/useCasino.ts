import { useCallback, useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS } from '@/config/contracts';
import { CASINO_ABI } from '@/config/abis';

export type GameName =
  | 'Coinflip' | 'Slot' | 'Plinko' | 'RPS'
  | 'VideoPoker' | 'Roulette' | 'LuckyWheel' | 'SpinToWin';

export interface SettleResult {
  game: string;
  payout: string;        // formatted in zkLTC
  payoutWei: ethers.BigNumber;
  win: boolean;
  resultBytes: string;   // 0x… raw result blob
  txHash: string;
}

export interface CasinoStats {
  minBet: string;
  maxBet: string;
  houseEdgeBP: number;   // basis points (100 = 1%)
  isActive: boolean;
  bankroll: string;      // contract balance (zkLTC)
  minBetWei: ethers.BigNumber;
  maxBetWei: ethers.BigNumber;
  bankrollWei: ethers.BigNumber;
}

export function useCasino(signer: ethers.Signer | null, address: string | null) {
  const [stats, setStats] = useState<CasinoStats>({
    minBet: '0', maxBet: '0', houseEdgeBP: 0, isActive: true, bankroll: '0',
    minBetWei: ethers.constants.Zero, maxBetWei: ethers.constants.Zero, bankrollWei: ethers.constants.Zero,
  });
  const [busy, setBusy] = useState<GameName | null>(null);
  const [lastResult, setLastResult] = useState<SettleResult | null>(null);
  const provider = useRef<ethers.providers.Provider | null>(null);

  const getReadContract = useCallback(() => {
    if (signer?.provider) {
      provider.current = signer.provider;
      return new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, signer.provider);
    }
    // Fallback public RPC (read-only) so stats render before connect
    if (!provider.current) {
      provider.current = new ethers.providers.JsonRpcProvider(
        'https://liteforge.rpc.caldera.xyz/http'
      );
    }
    return new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, provider.current);
  }, [signer]);

  const refreshStats = useCallback(async () => {
    try {
      const c = getReadContract();
      const [minBet, maxBet, edge, active, bankroll] = await Promise.all([
        c.minBet(),
        c.maxBet(),
        c.houseEdgeBP(),
        c.isActive(),
        provider.current!.getBalance(CONTRACTS.CASINO),
      ]);
      setStats({
        minBet: ethers.utils.formatEther(minBet),
        maxBet: ethers.utils.formatEther(maxBet),
        houseEdgeBP: Number(edge),
        isActive: Boolean(active),
        bankroll: ethers.utils.formatEther(bankroll),
        minBetWei: minBet,
        maxBetWei: maxBet,
        bankrollWei: bankroll,
      });
    } catch { /* leave defaults */ }
  }, [getReadContract]);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  /** Send a play tx and wait for the GameSettled event in the receipt. */
  const play = useCallback(async (
    game: GameName,
    method: string,
    args: unknown[],
    valueEth: string,
  ): Promise<SettleResult> => {
    if (!signer || !address) throw new Error('Connect your wallet first');
    setBusy(game);
    try {
      const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, signer);
      const value = ethers.utils.parseEther(valueEth);

      // Client-side pre-flight: bounds + bankroll. Throws a friendly error
      // BEFORE submitting the tx so users never burn gas on a sure revert.
      if (!stats.minBetWei.isZero() && value.lt(stats.minBetWei)) {
        throw new Error(`Bet below min (${stats.minBet} zkLTC)`);
      }
      if (!stats.maxBetWei.isZero() && value.gt(stats.maxBetWei)) {
        throw new Error(`Bet above max (${stats.maxBet} zkLTC)`);
      }
      if (!stats.isActive) {
        throw new Error('Casino is paused — try again later');
      }
      // Quick simulation via callStatic to surface contract revert reason
      // (e.g. "bet size?" / "bankroll?") before sending.
      try {
        await c.callStatic[method](...args, { value });
      } catch (sim: any) {
        const reason = sim?.reason || sim?.error?.message || sim?.message || '';
        if (/bet size/i.test(reason)) throw new Error(`Bet outside allowed range — adjust min/max`);
        if (/bankroll|payout/i.test(reason)) throw new Error('Casino bankroll too low for this bet — try a smaller amount');
        if (/paused|active/i.test(reason)) throw new Error('Casino is paused');
        // Fall through — let real tx run if simulation isn't conclusive
      }

      const tx = await c[method](...args, { value });
      const receipt = await tx.wait();

      // Parse GameSettled event
      const iface = new ethers.utils.Interface(CASINO_ABI);
      let settled: SettleResult | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === 'GameSettled') {
            settled = {
              game: parsed.args.game,
              payout: ethers.utils.formatEther(parsed.args.payout),
              payoutWei: parsed.args.payout,
              win: parsed.args.win,
              resultBytes: parsed.args.result,
              txHash: receipt.transactionHash,
            };
            break;
          }
        } catch { /* not our event */ }
      }
      if (!settled) {
        // Fallback: assume loss with empty result
        settled = {
          game, payout: '0', payoutWei: ethers.constants.Zero,
          win: false, resultBytes: '0x', txHash: receipt.transactionHash,
        };
      }
      setLastResult(settled);
      refreshStats();
      return settled;
    } finally {
      setBusy(null);
    }
  }, [signer, address, refreshStats, stats]);

  // Convenience wrappers per game
  const playCoinflip   = (heads: boolean, bet: string) =>
    play('Coinflip', 'playCoinflip', [heads], bet);
  const playSlot       = (b: [number, number, number], bet: string) =>
    play('Slot', 'playSlot', [b], bet);
  const playPlinko     = (bet: string) =>
    play('Plinko', 'playPlinko', [], bet);
  const playRPS        = (move: 0 | 1 | 2, bet: string) =>
    play('RPS', 'playRPS', [move], bet);
  const playVideoPoker = (guess: number, bet: string) =>
    play('VideoPoker', 'playVideoPoker', [guess], bet);
  const playRoulette   = (number: number, bet: string) =>
    play('Roulette', 'playRoulette', [number], bet);
  const playLuckyWheel = (segment: number, bet: string) =>
    play('LuckyWheel', 'playLuckyWheel', [segment], bet);
  const playSpinToWin  = (bet: string) =>
    play('SpinToWin', 'playSpinToWin', [], bet);

  const deposit = useCallback(async (amount: string) => {
    if (!signer) throw new Error('Connect wallet');
    const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, signer);
    const tx = await c.deposit({ value: ethers.utils.parseEther(amount) });
    await tx.wait();
    refreshStats();
    return tx.hash;
  }, [signer, refreshStats]);

  const withdraw = useCallback(async (amount: string) => {
    if (!signer) throw new Error('Connect wallet');
    const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, signer);
    const tx = await c.withdraw(ethers.utils.parseEther(amount));
    await tx.wait();
    refreshStats();
    return tx.hash;
  }, [signer, refreshStats]);

  const adminCall = useCallback(async (method: string, args: unknown[]) => {
    if (!signer) throw new Error('Connect wallet');
    const c = new ethers.Contract(CONTRACTS.CASINO, CASINO_ABI, signer);
    const tx = await c[method](...args);
    await tx.wait();
    refreshStats();
    return tx.hash;
  }, [signer, refreshStats]);

  const getOwner = useCallback(async (): Promise<string> => {
    const c = getReadContract();
    return await c.owner();
  }, [getReadContract]);

  return {
    stats, busy, lastResult, refreshStats,
    playCoinflip, playSlot, playPlinko, playRPS,
    playVideoPoker, playRoulette, playLuckyWheel, playSpinToWin,
    deposit, withdraw, adminCall, getOwner,
  };
}
