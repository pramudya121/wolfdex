import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, isNativeToken, isWrappedNative, isWrapUnwrap, CHAIN_CONFIG, type TokenInfo } from '@/config/contracts';
import { ROUTER_ABI, WETH_ABI, ERC20_ABI, FACTORY_ABI, PAIR_ABI, MULTICALL_ABI } from '@/config/abis';

const DEFAULT_DEADLINE_MINUTES = 20;
const DEFAULT_SLIPPAGE_BIPS = 50; // 0.5%

function getDeadline(minutes?: number) {
  const m = minutes && minutes > 0 ? minutes : DEFAULT_DEADLINE_MINUTES;
  return Math.floor(Date.now() / 1000) + m * 60;
}

function calcMinAmount(amount: ethers.BigNumber, slippageBips: number) {
  return amount.sub(amount.mul(slippageBips).div(10000));
}

/** Convert a percent string ("0.5") to bips (50). Falls back to default. */
function pctToBips(pct?: number): number {
  if (pct == null || isNaN(pct) || pct < 0) return DEFAULT_SLIPPAGE_BIPS;
  return Math.max(1, Math.floor(pct * 100));
}

/** Smart-routing result: best-output path + the projected output amount. */
export interface RouteQuote {
  path: string[];      // raw on-chain path of token addresses (WETH-substituted)
  hops: number;        // path.length - 1
  amountOut: string;   // formatted ether string (best output)
  via: 'direct' | 'WETH';
  /**
   * Mid/spot price across the entire path BEFORE this trade lands
   * (units: toToken per 1 fromToken). Computed from reserves of every hop.
   */
  spotPrice: number;
  /** Effective execution price for THIS trade (toToken per 1 fromToken). */
  executionPrice: number;
  /** Price impact in percent — always >= 0. (spot - exec) / spot * 100. */
  priceImpactPct: number;
  /** Per-hop reserve snapshot for UI/diagnostics. */
  hopReserves: Array<{ pair: string; reserveIn: string; reserveOut: string }>;
}

/** Result of a pre-flight validation check before submitting a swap tx. */
export interface SwapPreflight {
  ok: boolean;
  warnings: string[];
  errors: string[];
  details: {
    path: string[];
    amountIn: string;          // formatted ether
    amountOutMin: string;      // formatted ether (post-slippage floor)
    deadline: number;          // unix seconds
    deadlineIso: string;
    slippageBips: number;
    needsApproval: boolean;
    currentAllowance: string;  // formatted ether
    balance: string;           // formatted ether
    pairExists: boolean[];     // one per hop
    estimatedGas: string | null;
    method: 'swapExactETHForTokens' | 'swapExactTokensForETH' | 'swapExactTokensForTokens' | 'wrap' | 'unwrap';
    value: string;             // ETH value sent (formatted)
  };
}

export function useDex(signer: ethers.Signer | null, address: string | null) {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read-only fallback provider (used when no wallet is connected so Pools/Analytics
  // load instantly without requiring a connection)
  const readProvider = signer?.provider ?? new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);

  const getRouter = useCallback(() => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(CONTRACTS.ROUTER, ROUTER_ABI, signer);
  }, [signer]);

  const getFactory = useCallback(() => {
    return new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, signer ?? readProvider);
  }, [signer, readProvider]);

  const getWeth = useCallback(() => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(CONTRACTS.WETH, WETH_ABI, signer);
  }, [signer]);

  const getErc20 = useCallback((tokenAddress: string) => {
    if (!signer) throw new Error('Wallet not connected');
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  }, [signer]);

  const getPair = useCallback((pairAddress: string) => {
    return new ethers.Contract(pairAddress, PAIR_ABI, signer ?? readProvider);
  }, [signer, readProvider]);

  const approveToken = useCallback(async (tokenAddress: string, amount: ethers.BigNumber, spender?: string) => {
    const token = getErc20(tokenAddress);
    const allowance = await token.allowance(address, spender || CONTRACTS.ROUTER);
    if (allowance.lt(amount)) {
      const tx = await token.approve(spender || CONTRACTS.ROUTER, ethers.constants.MaxUint256);
      await tx.wait();
    }
  }, [getErc20, address]);

  const getAmountsOut = useCallback(async (amountIn: string, path: string[]): Promise<string> => {
    try {
      const router = getRouter();
      const amounts = await router.getAmountsOut(ethers.utils.parseEther(amountIn), path);
      return ethers.utils.formatEther(amounts[amounts.length - 1]);
    } catch { return '0'; }
  }, [getRouter]);

  /**
   * Smart Order Routing — picks the best path between two tokens by trying:
   *   1. Direct pair (A → B)
   *   2. Multi-hop via WETH (A → WETH → B)
   * and returns whichever yields more output. Falls back gracefully when
   * one of the paths has no liquidity.
   */
  const getBestRoute = useCallback(async (
    fromToken: TokenInfo,
    toToken: TokenInfo,
    amountIn: string,
  ): Promise<RouteQuote | null> => {
    if (!signer) return null;
    const parsed = parseFloat(amountIn);
    if (!parsed || parsed <= 0) return null;

    const fromAddr = isNativeToken(fromToken.address) ? CONTRACTS.WETH : fromToken.address;
    const toAddr = isNativeToken(toToken.address) ? CONTRACTS.WETH : toToken.address;
    if (fromAddr.toLowerCase() === toAddr.toLowerCase()) return null;

    const router = new ethers.Contract(CONTRACTS.ROUTER, ROUTER_ABI, signer);
    const amountInWei = ethers.utils.parseEther(amountIn);

    const tryPath = async (path: string[]): Promise<ethers.BigNumber | null> => {
      try {
        const amounts = await router.getAmountsOut(amountInWei, path);
        return amounts[amounts.length - 1];
      } catch { return null; }
    };

    const directPath = [fromAddr, toAddr];
    const hopPath = [fromAddr, CONTRACTS.WETH, toAddr];
    const isDirectViaWeth =
      fromAddr.toLowerCase() === CONTRACTS.WETH.toLowerCase() ||
      toAddr.toLowerCase() === CONTRACTS.WETH.toLowerCase();

    const [directOut, hopOut] = await Promise.all([
      tryPath(directPath),
      isDirectViaWeth ? Promise.resolve(null) : tryPath(hopPath),
    ]);

    let best: { path: string[]; out: ethers.BigNumber; via: 'direct' | 'WETH' } | null = null;
    if (directOut && !directOut.isZero()) best = { path: directPath, out: directOut, via: 'direct' };
    if (hopOut && !hopOut.isZero() && (!best || hopOut.gt(best.out))) {
      best = { path: hopPath, out: hopOut, via: 'WETH' };
    }
    if (!best) return null;

    // Resolve every hop's pair address + reserves for accurate price-impact math.
    const factory = new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, signer);
    const hopReserves: Array<{ pair: string; reserveIn: string; reserveOut: string }> = [];
    let spotPrice = 1; // toToken per fromToken across the chain
    try {
      for (let i = 0; i < best.path.length - 1; i++) {
        const tokenIn = best.path[i];
        const tokenOut = best.path[i + 1];
        const pairAddr = await factory.getPair(tokenIn, tokenOut);
        if (!pairAddr || pairAddr === ethers.constants.AddressZero) {
          spotPrice = 0;
          break;
        }
        const pair = new ethers.Contract(pairAddr, PAIR_ABI, signer);
        const [reserves, token0] = await Promise.all([pair.getReserves(), pair.token0()]);
        const inIs0 = String(token0).toLowerCase() === tokenIn.toLowerCase();
        const reserveIn = inIs0 ? reserves[0] : reserves[1];
        const reserveOut = inIs0 ? reserves[1] : reserves[0];
        hopReserves.push({
          pair: pairAddr,
          reserveIn: ethers.utils.formatEther(reserveIn),
          reserveOut: ethers.utils.formatEther(reserveOut),
        });
        // Spot rate for this hop = reserveOut / reserveIn (no fee, no slippage)
        const rIn = parseFloat(ethers.utils.formatEther(reserveIn));
        const rOut = parseFloat(ethers.utils.formatEther(reserveOut));
        if (rIn <= 0) { spotPrice = 0; break; }
        spotPrice *= rOut / rIn;
      }
    } catch { spotPrice = 0; }

    const amtIn = parseFloat(amountIn);
    const amtOut = parseFloat(ethers.utils.formatEther(best.out));
    const executionPrice = amtIn > 0 ? amtOut / amtIn : 0;
    const priceImpactPct = spotPrice > 0 && executionPrice > 0
      ? Math.max(0, (1 - executionPrice / spotPrice) * 100)
      : 0;

    return {
      path: best.path,
      hops: best.path.length - 1,
      amountOut: ethers.utils.formatEther(best.out),
      via: best.via,
      spotPrice,
      executionPrice,
      priceImpactPct,
      hopReserves,
    };
  }, [signer]);

  const swap = useCallback(async (fromToken: TokenInfo, toToken: TokenInfo, amountIn: string, amountOutMin: string, slippagePct?: number, deadlineMinutes?: number, routePath?: string[]) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const slippageBips = pctToBips(slippagePct);
      const wrapType = isWrapUnwrap(fromToken.address, toToken.address);
      if (wrapType === 'wrap') {
        const weth = getWeth();
        const tx = await weth.deposit({ value: ethers.utils.parseEther(amountIn) });
        await tx.wait();
        setTxHash(tx.hash);
        return tx.hash;
      }
      if (wrapType === 'unwrap') {
        const weth = getWeth();
        const tx = await weth.withdraw(ethers.utils.parseEther(amountIn));
        await tx.wait();
        setTxHash(tx.hash);
        return tx.hash;
      }

      const router = getRouter();
      const deadline = getDeadline(deadlineMinutes);
      const parsedIn = ethers.utils.parseEther(amountIn);
      const parsedOutMin = calcMinAmount(ethers.utils.parseEther(amountOutMin), slippageBips);
      let tx;

      const fromNative = isNativeToken(fromToken.address);
      const toNative = isNativeToken(toToken.address);
      const fromAddr = fromNative ? CONTRACTS.WETH : fromToken.address;
      const toAddr = toNative ? CONTRACTS.WETH : toToken.address;
      // Use provided smart-routed path when supplied (must start/end with our
      // wrapped equivalents); otherwise fall back to direct pair.
      const path = routePath && routePath.length >= 2 ? routePath : [fromAddr, toAddr];

      if (fromNative) {
        tx = await router.swapExactETHForTokens(parsedOutMin, path, address, deadline, { value: parsedIn });
      } else if (toNative) {
        await approveToken(fromToken.address, parsedIn);
        tx = await router.swapExactTokensForETH(parsedIn, parsedOutMin, path, address, deadline);
      } else {
        await approveToken(fromToken.address, parsedIn);
        tx = await router.swapExactTokensForTokens(parsedIn, parsedOutMin, path, address, deadline);
      }

      await tx.wait();
      setTxHash(tx.hash);
      return tx.hash;
    } catch (e: any) {
      setError(e.reason || e.message || 'Swap failed');
      throw e;
    } finally { setLoading(false); }
  }, [getRouter, getWeth, address, approveToken]);

  const addLiquidity = useCallback(async (
    tokenA: TokenInfo, tokenB: TokenInfo,
    amountA: string, amountB: string,
    slippagePct?: number,
    deadlineMinutes?: number,
  ) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const slippageBips = pctToBips(slippagePct);
      const router = getRouter();
      const deadline = getDeadline(deadlineMinutes);
      const parsedA = ethers.utils.parseEther(amountA);
      const parsedB = ethers.utils.parseEther(amountB);
      const minA = calcMinAmount(parsedA, slippageBips);
      const minB = calcMinAmount(parsedB, slippageBips);
      let tx;

      const aNative = isNativeToken(tokenA.address);
      const bNative = isNativeToken(tokenB.address);

      if (aNative || bNative) {
        const token = aNative ? tokenB : tokenA;
        const tokenAmt = aNative ? parsedB : parsedA;
        const ethAmt = aNative ? parsedA : parsedB;
        const tokenMin = aNative ? minB : minA;
        const ethMin = aNative ? minA : minB;
        await approveToken(token.address, tokenAmt);
        tx = await router.addLiquidityETH(token.address, tokenAmt, tokenMin, ethMin, address, deadline, { value: ethAmt });
      } else {
        await approveToken(tokenA.address, parsedA);
        await approveToken(tokenB.address, parsedB);
        tx = await router.addLiquidity(tokenA.address, tokenB.address, parsedA, parsedB, minA, minB, address, deadline);
      }

      await tx.wait();
      setTxHash(tx.hash);
      return tx.hash;
    } catch (e: any) {
      setError(e.reason || e.message || 'Add liquidity failed');
      throw e;
    } finally { setLoading(false); }
  }, [getRouter, address, approveToken]);

  const removeLiquidity = useCallback(async (
    tokenA: TokenInfo, tokenB: TokenInfo,
    liquidity: string, pairAddress: string,
    slippagePct?: number,
    deadlineMinutes?: number,
  ) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const slippageBips = pctToBips(slippagePct);
      const router = getRouter();
      const deadline = getDeadline(deadlineMinutes);
      const parsedLiq = ethers.utils.parseEther(liquidity);

      // Compute expected token amounts from current pool reserves to enforce a
      // minimum-output floor. Without this, MEV bots can sandwich the tx and
      // drain the user's position. We always read fresh on-chain state so the
      // floor reflects the latest reserves at submission time.
      const pair = getPair(pairAddress);
      const [reserves, token0Addr, totalSupply] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
        pair.totalSupply(),
      ]);
      // pair.token0 is always the lower-address token; map our A/B accordingly.
      const tokenAAddrForPair = isNativeToken(tokenA.address) ? CONTRACTS.WETH : tokenA.address;
      const aIsToken0 = tokenAAddrForPair.toLowerCase() === String(token0Addr).toLowerCase();
      const reserveA = aIsToken0 ? reserves[0] : reserves[1];
      const reserveB = aIsToken0 ? reserves[1] : reserves[0];
      // expected = reserve * liquidity / totalSupply
      const expectedA = totalSupply.isZero() ? ethers.BigNumber.from(0) : reserveA.mul(parsedLiq).div(totalSupply);
      const expectedB = totalSupply.isZero() ? ethers.BigNumber.from(0) : reserveB.mul(parsedLiq).div(totalSupply);
      const minA = calcMinAmount(expectedA, slippageBips);
      const minB = calcMinAmount(expectedB, slippageBips);

      await approveToken(pairAddress, parsedLiq);
      let tx;

      const aNative = isNativeToken(tokenA.address);
      const bNative = isNativeToken(tokenB.address);

      if (aNative || bNative) {
        const token = aNative ? tokenB : tokenA;
        // removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, ...)
        const tokenMin = aNative ? minB : minA;
        const ethMin = aNative ? minA : minB;
        tx = await router.removeLiquidityETH(token.address, parsedLiq, tokenMin, ethMin, address, deadline);
      } else {
        tx = await router.removeLiquidity(tokenA.address, tokenB.address, parsedLiq, minA, minB, address, deadline);
      }

      await tx.wait();
      setTxHash(tx.hash);
      return tx.hash;
    } catch (e: any) {
      setError(e.reason || e.message || 'Remove liquidity failed');
      throw e;
    } finally { setLoading(false); }
  }, [getRouter, getPair, address, approveToken]);

  const getTokenBalance = useCallback(async (tokenAddress: string): Promise<string> => {
    if (!signer || !address) return '0';
    try {
      if (isNativeToken(tokenAddress)) {
        const bal = await signer.provider!.getBalance(address);
        return ethers.utils.formatEther(bal);
      }
      const token = getErc20(tokenAddress);
      const bal = await token.balanceOf(address);
      return ethers.utils.formatEther(bal);
    } catch { return '0'; }
  }, [signer, address, getErc20]);

  /**
   * Fast batched balance reader using Multicall — single RPC round-trip
   * instead of N sequential calls. Falls back to a parallel Promise.all
   * read if multicall fails (e.g. unknown token decimals / odd chain).
   * Returns balances in the same order as the input addresses.
   */
  const getMultipleBalances = useCallback(async (
    tokenAddresses: string[],
  ): Promise<string[]> => {
    if (!address) return tokenAddresses.map(() => '0');
    // Use a public read provider so this works even when not connected via signer
    const readProvider = signer?.provider ?? new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);

    // Try multicall first
    try {
      const erc20Iface = new ethers.utils.Interface(ERC20_ABI);
      const multicall = new ethers.Contract(CONTRACTS.MULTICALL, MULTICALL_ABI, readProvider);
      const calls: { target: string; callData: string }[] = [];
      const nativeIdx: number[] = [];
      tokenAddresses.forEach((addr, i) => {
        if (isNativeToken(addr)) {
          nativeIdx.push(i);
          calls.push({ target: CONTRACTS.MULTICALL, callData: multicall.interface.encodeFunctionData('getEthBalance', [address]) });
        } else {
          calls.push({ target: addr, callData: erc20Iface.encodeFunctionData('balanceOf', [address]) });
        }
      });
      const { returnData } = await multicall.callStatic.aggregate(calls);
      return returnData.map((data: string, i: number) => {
        try {
          const decoded = ethers.BigNumber.from(data);
          return ethers.utils.formatEther(decoded);
        } catch { return '0'; }
      });
    } catch {
      // Fallback: parallel reads
      const results = await Promise.all(tokenAddresses.map(async (addr) => {
        try {
          if (isNativeToken(addr)) {
            const bal = await readProvider.getBalance(address);
            return ethers.utils.formatEther(bal);
          }
          const token = new ethers.Contract(addr, ERC20_ABI, readProvider);
          const bal = await token.balanceOf(address);
          return ethers.utils.formatEther(bal);
        } catch { return '0'; }
      }));
      return results;
    }
  }, [signer, address]);

  const getPairAddress = useCallback(async (tokenA: string, tokenB: string): Promise<string> => {
    try {
      const factory = getFactory();
      const addrA = isNativeToken(tokenA) ? CONTRACTS.WETH : tokenA;
      const addrB = isNativeToken(tokenB) ? CONTRACTS.WETH : tokenB;
      return await factory.getPair(addrA, addrB);
    } catch { return ethers.constants.AddressZero; }
  }, [getFactory]);

  const getPairInfo = useCallback(async (pairAddress: string) => {
    try {
      const pair = getPair(pairAddress);
      const [reserves, token0, token1, totalSupply] = await Promise.all([
        pair.getReserves(),
        pair.token0(),
        pair.token1(),
        pair.totalSupply(),
      ]);
      return {
        reserve0: ethers.utils.formatEther(reserves[0]),
        reserve1: ethers.utils.formatEther(reserves[1]),
        token0, token1,
        totalSupply: ethers.utils.formatEther(totalSupply),
      };
    } catch { return null; }
  }, [getPair]);

  const getAllPairs = useCallback(async () => {
    try {
      const factory = getFactory();
      const length = await factory.allPairsLength();
      const count = Math.min(length.toNumber(), 50);
      // Parallelize factory.allPairs(i) calls — was sequential
      const pairs = await Promise.all(
        Array.from({ length: count }, (_, i) => factory.allPairs(i).catch(() => null))
      );
      return pairs.filter((p): p is string => !!p);
    } catch { return []; }
  }, [getFactory]);

  return {
    loading, txHash, error, setError,
    swap, addLiquidity, removeLiquidity,
    getAmountsOut, getBestRoute, getTokenBalance, getMultipleBalances,
    getPairAddress, getPairInfo, getAllPairs,
    approveToken, getErc20,
  };
}
