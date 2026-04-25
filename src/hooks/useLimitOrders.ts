/**
 * On-chain limit order hook — backed by the deployed LimitOrderDEX contract.
 *
 * All reads come from contract events (OrderPlaced / OrderFilled /
 * OrderCancelled) via `eth_getLogs`. All writes (place, cancel, fill) call
 * the contract directly — there is no client-side keeper anymore. Status is
 * derived from chain state, not local storage.
 *
 * The shape of the returned `LimitOrder` mirrors the previous client-side
 * type so existing UI (LimitOrderCard / OpenOrdersList / AIAgentPanel /
 * GlobalLimitWatcher) keeps working with minimal churn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACTS, CHAIN_CONFIG, getTokenByAddress, NATIVE_TOKEN, type TokenInfo } from '@/config/contracts';
import { LIMIT_ORDER_ABI, ERC20_ABI } from '@/config/abis';

export type LimitOrderStatus = 'open' | 'filled' | 'cancelled' | 'expired' | 'failed';
export type LimitOrderSide = 'buy' | 'sell';

export interface LimitOrder {
  /** orderHash from the contract — unique on-chain identifier. */
  id: string;
  account: string;             // maker
  fromToken: TokenInfo;        // sellToken (resolved to native if WETH)
  toToken: TokenInfo;          // buyToken (resolved to native if WETH)
  amountIn: string;            // formatted sellAmount (ether units)
  amountOut: string;           // formatted buyAmount (ether units)
  /** Target rate as toToken-per-fromToken = buyAmount / sellAmount. */
  targetRate: string;
  side: LimitOrderSide;
  status: LimitOrderStatus;
  createdAt: number;           // ms epoch (block timestamp * 1000)
  expiresAt: number;           // ms epoch — 0 means never
  nonce: string;
  /** Tx hash for the placement. */
  placeTxHash?: string;
  /** Tx hash once filled. */
  txHash?: string;
  /** Filled amounts (only set when status='filled'). */
  filledSell?: string;
  filledBuy?: string;
  /** Failure reason if status='failed'. */
  errorMessage?: string;
  /** Live market quote for UI distance display (off-chain, optional). */
  lastQuoteOut?: string;
  lastCheckedAt?: number;
}

const POLL_INTERVAL_MS = 20_000;
/** How many blocks back to scan on first load. ~3 days at 2s blocks. */
const HISTORY_BLOCK_RANGE = 120_000;
const MAX_LOG_BATCH = 5_000;

const WETH = CONTRACTS.WETH.toLowerCase();

/** Resolve a sellToken/buyToken address to a TokenInfo, treating WETH as native. */
function resolveToken(addr: string): TokenInfo {
  const lower = addr.toLowerCase();
  if (lower === WETH) return NATIVE_TOKEN;
  const known = getTokenByAddress(addr);
  if (known) return known;
  return {
    address: addr,
    symbol: addr.slice(0, 6) + '…' + addr.slice(-4),
    name: 'Unknown',
    decimals: 18,
    logo: '/images/wdex-logo.png',
  };
}

/** Resolve a UI-side TokenInfo to the on-chain ERC20 address (WETH for native). */
export function toErc20Address(t: TokenInfo): string {
  return t.isNative ? CONTRACTS.WETH : t.address;
}

interface RawOrder {
  hash: string;
  maker: string;
  sellToken: string;
  buyToken: string;
  sellAmount: ethers.BigNumber;
  buyAmount: ethers.BigNumber;
  expiry: ethers.BigNumber;
  nonce: ethers.BigNumber;
  createdAtMs: number;
  placeTxHash: string;
}

interface FillInfo {
  taker: string;
  filledSell: ethers.BigNumber;
  filledBuy: ethers.BigNumber;
  txHash: string;
}

function formatAmt(b: ethers.BigNumber): string {
  try { return ethers.utils.formatEther(b); } catch { return '0'; }
}

function buildOrder(raw: RawOrder, opts: {
  filled?: FillInfo;
  cancelled?: boolean;
}): LimitOrder {
  const sellTok = resolveToken(raw.sellToken);
  const buyTok = resolveToken(raw.buyToken);
  const sell = formatAmt(raw.sellAmount);
  const buy = formatAmt(raw.buyAmount);
  const sellN = parseFloat(sell);
  const buyN = parseFloat(buy);
  const target = sellN > 0 ? (buyN / sellN).toString() : '0';
  const expiryMs = raw.expiry.isZero() ? 0 : raw.expiry.toNumber() * 1000;
  let status: LimitOrderStatus = 'open';
  if (opts.cancelled) status = 'cancelled';
  else if (opts.filled) status = 'filled';
  else if (expiryMs > 0 && Date.now() > expiryMs) status = 'expired';
  return {
    id: raw.hash,
    account: raw.maker,
    fromToken: sellTok,
    toToken: buyTok,
    amountIn: sell,
    amountOut: buy,
    targetRate: target,
    side: 'sell',
    status,
    createdAt: raw.createdAtMs,
    expiresAt: expiryMs,
    nonce: raw.nonce.toString(),
    placeTxHash: raw.placeTxHash,
    txHash: opts.filled?.txHash,
    filledSell: opts.filled ? formatAmt(opts.filled.filledSell) : undefined,
    filledBuy: opts.filled ? formatAmt(opts.filled.filledBuy) : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Shared cross-component store                       */
/* -------------------------------------------------------------------------- */

const listeners = new Set<(orders: LimitOrder[]) => void>();
let cache: LimitOrder[] = [];
let lastScannedBlock = 0;
let inflight: Promise<void> | null = null;
let provider: ethers.providers.JsonRpcProvider | null = null;

function getProvider(): ethers.providers.JsonRpcProvider {
  if (!provider) provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
  return provider;
}

function getReadContract(): ethers.Contract {
  return new ethers.Contract(CONTRACTS.LIMIT_ORDER, LIMIT_ORDER_ABI, getProvider());
}

function broadcast() {
  for (const l of listeners) l(cache);
}

/**
 * Pull events between [from, to] in MAX_LOG_BATCH-sized chunks. Returns logs
 * in chronological order. Caldera RPC tolerates ~10k blocks per call but we
 * chunk smaller to be safe.
 */
async function getLogsChunked(
  prov: ethers.providers.Provider,
  filter: ethers.providers.Filter,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.providers.Log[]> {
  if (fromBlock > toBlock) return [];
  const out: ethers.providers.Log[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = Math.min(cursor + MAX_LOG_BATCH - 1, toBlock);
    try {
      const logs = await prov.getLogs({ ...filter, fromBlock: cursor, toBlock: end });
      out.push(...logs);
    } catch {
      // narrow if the RPC complains about range size
      if (end - cursor > 500) {
        const mid = Math.floor((cursor + end) / 2);
        out.push(...(await getLogsChunked(prov, filter, cursor, mid)));
        out.push(...(await getLogsChunked(prov, filter, mid + 1, end)));
      }
      // else swallow — rare provider hiccup, next tick will retry
    }
    cursor = end + 1;
  }
  return out;
}

/**
 * Index Placed/Filled/Cancelled events from the LimitOrderDEX contract and
 * rebuild the in-memory `cache`. Idempotent and incremental — subsequent
 * calls only scan new blocks.
 */
async function indexEvents(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const prov = getProvider();
    const contract = getReadContract();
    const iface = contract.interface;

    const head = await prov.getBlockNumber().catch(() => 0);
    if (!head) return;

    const fromBlock = lastScannedBlock > 0
      ? lastScannedBlock + 1
      : Math.max(head - HISTORY_BLOCK_RANGE, 0);
    if (fromBlock > head) { lastScannedBlock = head; return; }

    const placedTopic = iface.getEventTopic('OrderPlaced');
    const filledTopic = iface.getEventTopic('OrderFilled');
    const cancelledTopic = iface.getEventTopic('OrderCancelled');

    const logs = await getLogsChunked(prov, {
      address: CONTRACTS.LIMIT_ORDER,
      topics: [[placedTopic, filledTopic, cancelledTopic]],
    }, fromBlock, head);

    // Map orderHash → raw / fills / cancelled (merged with existing cache).
    const byHash = new Map<string, LimitOrder>();
    for (const o of cache) byHash.set(o.id, o);
    const rawByHash = new Map<string, RawOrder>();
    const fillByHash = new Map<string, FillInfo>();
    const cancelledSet = new Set<string>();

    // Pre-fetch block timestamps in parallel (small set in practice).
    const uniqueBlocks = Array.from(new Set(logs.map(l => l.blockNumber)));
    const blockTs = new Map<number, number>();
    await Promise.all(uniqueBlocks.map(async bn => {
      try {
        const blk = await prov.getBlock(bn);
        if (blk) blockTs.set(bn, blk.timestamp * 1000);
      } catch { /* ignore */ }
    }));

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        const hash = (parsed.args.orderHash as string).toLowerCase();
        if (parsed.name === 'OrderPlaced') {
          const o = parsed.args.order;
          rawByHash.set(hash, {
            hash,
            maker: (parsed.args.maker as string).toLowerCase(),
            sellToken: o.sellToken,
            buyToken: o.buyToken,
            sellAmount: o.sellAmount,
            buyAmount: o.buyAmount,
            expiry: o.expiry,
            nonce: o.nonce,
            createdAtMs: blockTs.get(log.blockNumber) ?? Date.now(),
            placeTxHash: log.transactionHash,
          });
        } else if (parsed.name === 'OrderFilled') {
          fillByHash.set(hash, {
            taker: (parsed.args.taker as string).toLowerCase(),
            filledSell: parsed.args.filledSell,
            filledBuy: parsed.args.filledBuy,
            txHash: log.transactionHash,
          });
        } else if (parsed.name === 'OrderCancelled') {
          cancelledSet.add(hash);
        }
      } catch { /* skip malformed log */ }
    }

    // Merge existing cache (so we keep historical orders that were placed
    // earlier than HISTORY_BLOCK_RANGE) with fresh placements.
    for (const [hash, raw] of rawByHash.entries()) {
      const filled = fillByHash.get(hash);
      const cancelled = cancelledSet.has(hash);
      const built = buildOrder(raw, { filled, cancelled });
      byHash.set(hash, built);
    }
    // Apply new fills/cancels onto pre-existing cached orders.
    for (const [hash, fill] of fillByHash.entries()) {
      const existing = byHash.get(hash);
      if (existing && existing.status !== 'filled') {
        byHash.set(hash, { ...existing, status: 'filled', txHash: fill.txHash,
          filledSell: formatAmt(fill.filledSell), filledBuy: formatAmt(fill.filledBuy) });
      }
    }
    for (const hash of cancelledSet) {
      const existing = byHash.get(hash);
      if (existing && existing.status === 'open') {
        byHash.set(hash, { ...existing, status: 'cancelled' });
      }
    }
    // Re-evaluate expiries
    const now = Date.now();
    for (const [hash, o] of byHash.entries()) {
      if (o.status === 'open' && o.expiresAt > 0 && now > o.expiresAt) {
        byHash.set(hash, { ...o, status: 'expired' });
      }
    }

    cache = Array.from(byHash.values()).sort((a, b) => b.createdAt - a.createdAt);
    lastScannedBlock = head;
    broadcast();
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Refresh now (manual). */
export async function refreshLimitOrders(): Promise<void> {
  return indexEvents();
}

/* -------------------------------------------------------------------------- */
/*                                   Hook API                                  */
/* -------------------------------------------------------------------------- */

interface CreateInput {
  account: string;
  fromToken: TokenInfo;
  toToken: TokenInfo;
  amountIn: string;
  /** target rate (toToken per 1 fromToken) — used to derive buyAmount. */
  targetRate: string;
  side?: LimitOrderSide;
  /** ms epoch; 0 = never */
  expiresAt: number;
  /** Optional precomputed buyAmount; overrides targetRate-derived value. */
  amountOut?: string;
}

export function useLimitOrders(account?: string | null) {
  const [list, setList] = useState<LimitOrder[]>(cache);
  const signerRef = useRef<ethers.Signer | null>(null);

  useEffect(() => {
    const onChange = (next: LimitOrder[]) => setList(next);
    listeners.add(onChange);
    indexEvents(); // initial load
    const id = window.setInterval(indexEvents, POLL_INTERVAL_MS);
    return () => { listeners.delete(onChange); window.clearInterval(id); };
  }, []);

  /** Set the active signer (called from DexContext when wallet connects). */
  const attachSigner = useCallback((signer: ethers.Signer | null) => {
    signerRef.current = signer;
  }, []);

  const filtered = useMemo(() => {
    if (!account) return list;
    const a = account.toLowerCase();
    return list.filter(o => o.account.toLowerCase() === a);
  }, [list, account]);

  const openCount = filtered.filter(o => o.status === 'open').length;

  /**
   * Place a real on-chain limit order:
   *   1. Approve sellToken (WETH if native) for the LimitOrderDEX contract.
   *   2. If selling native zkLTC, deposit it to WETH first.
   *   3. Call placeOrder(...) and wait for the OrderPlaced event.
   */
  const create = useCallback(async (input: CreateInput): Promise<LimitOrder> => {
    const signer = signerRef.current;
    if (!signer) throw new Error('Wallet not connected');

    const sellAddr = toErc20Address(input.fromToken);
    const buyAddr = toErc20Address(input.toToken);
    if (sellAddr.toLowerCase() === buyAddr.toLowerCase()) {
      throw new Error('sellToken and buyToken must differ');
    }

    const sellAmt = ethers.utils.parseEther(input.amountIn);
    const buyAmt = input.amountOut
      ? ethers.utils.parseEther(input.amountOut)
      : ethers.utils.parseEther(
          (parseFloat(input.amountIn) * parseFloat(input.targetRate)).toFixed(18),
        );
    const expiry = input.expiresAt > 0
      ? ethers.BigNumber.from(Math.floor(input.expiresAt / 1000))
      : ethers.BigNumber.from(0);
    const nonce = ethers.BigNumber.from(Date.now()).mul(1000).add(
      Math.floor(Math.random() * 1000),
    );

    // 1. Wrap native if needed.
    if (input.fromToken.isNative) {
      const weth = new ethers.Contract(CONTRACTS.WETH, [
        'function deposit() payable',
        'function balanceOf(address) view returns (uint256)',
      ], signer);
      const userAddr = await signer.getAddress();
      const wethBal: ethers.BigNumber = await weth.balanceOf(userAddr);
      if (wethBal.lt(sellAmt)) {
        const need = sellAmt.sub(wethBal);
        const tx = await weth.deposit({ value: need });
        await tx.wait();
      }
    }

    // 2. Approve LIMIT_ORDER as spender of sellToken.
    const erc20 = new ethers.Contract(sellAddr, ERC20_ABI, signer);
    const userAddr = await signer.getAddress();
    const allowance: ethers.BigNumber = await erc20.allowance(userAddr, CONTRACTS.LIMIT_ORDER);
    if (allowance.lt(sellAmt)) {
      const tx = await erc20.approve(CONTRACTS.LIMIT_ORDER, ethers.constants.MaxUint256);
      await tx.wait();
    }

    // 3. placeOrder
    const contract = new ethers.Contract(CONTRACTS.LIMIT_ORDER, LIMIT_ORDER_ABI, signer);
    const tx = await contract.placeOrder(sellAddr, buyAddr, sellAmt, buyAmt, expiry, nonce);
    const receipt = await tx.wait();

    // Parse the OrderPlaced event for the orderHash.
    const iface = contract.interface;
    let orderHash = '';
    for (const log of receipt.logs as ethers.providers.Log[]) {
      if (log.address.toLowerCase() !== CONTRACTS.LIMIT_ORDER.toLowerCase()) continue;
      try {
        const parsed = iface.parseLog(log);
        if (parsed.name === 'OrderPlaced') { orderHash = parsed.args.orderHash; break; }
      } catch { /* ignore */ }
    }

    // Trigger a re-index so the new order appears in the list immediately.
    await indexEvents();
    const created = cache.find(o => o.id.toLowerCase() === orderHash.toLowerCase());
    if (created) return created;

    // Fallback: synthesize from inputs if event parsing failed.
    return {
      id: orderHash || tx.hash,
      account: userAddr,
      fromToken: input.fromToken,
      toToken: input.toToken,
      amountIn: input.amountIn,
      amountOut: ethers.utils.formatEther(buyAmt),
      targetRate: input.targetRate,
      side: input.side ?? 'sell',
      status: 'open',
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
      nonce: nonce.toString(),
      placeTxHash: tx.hash,
    };
  }, []);

  /** Cancel an order on-chain. `id` is the orderHash. */
  const cancel = useCallback(async (id: string): Promise<string> => {
    const signer = signerRef.current;
    if (!signer) throw new Error('Wallet not connected');
    const contract = new ethers.Contract(CONTRACTS.LIMIT_ORDER, LIMIT_ORDER_ABI, signer);
    const tx = await contract.cancelOrder(id);
    await tx.wait();
    await indexEvents();
    return tx.hash;
  }, []);

  /** Fill someone else's order on-chain (taker side). */
  const fill = useCallback(async (id: string): Promise<string> => {
    const signer = signerRef.current;
    if (!signer) throw new Error('Wallet not connected');
    const contract = new ethers.Contract(CONTRACTS.LIMIT_ORDER, LIMIT_ORDER_ABI, signer);
    const order = cache.find(o => o.id.toLowerCase() === id.toLowerCase());
    if (!order) throw new Error('Order not found in cache');
    // Taker pays buyAmount of buyToken — approve first.
    const buyAddr = toErc20Address(order.toToken);
    const erc20 = new ethers.Contract(buyAddr, ERC20_ABI, signer);
    const userAddr = await signer.getAddress();
    const buyAmt = ethers.utils.parseEther(order.amountOut);
    const allowance: ethers.BigNumber = await erc20.allowance(userAddr, CONTRACTS.LIMIT_ORDER);
    if (allowance.lt(buyAmt)) {
      const aTx = await erc20.approve(CONTRACTS.LIMIT_ORDER, ethers.constants.MaxUint256);
      await aTx.wait();
    }
    const tx = await contract.fillOrder(id);
    await tx.wait();
    await indexEvents();
    return tx.hash;
  }, []);

  /** Local-only: clear cancelled/filled rows from the visible list. */
  const remove = useCallback((_id: string) => {
    // No-op for on-chain — we don't delete event-derived rows.
    // Kept for API compat with the previous client-side hook.
  }, []);
  const clear = useCallback(() => { /* no-op for on-chain */ }, []);

  /** Open orders (UI helper). */
  const openOrders = useMemo(
    () => filtered.filter(o => o.status === 'open'),
    [filtered],
  );

  return {
    list: filtered,
    all: list,
    openOrders,
    openCount,
    create,
    cancel,
    fill,
    remove,
    clear,
    attachSigner,
    refresh: refreshLimitOrders,
  };
}

/**
 * Legacy compatibility: the previous client-side implementation exported a
 * `useLimitOrderWatcher` hook that polled quotes and auto-executed swaps.
 * With on-chain orders, fills happen via takers calling `fillOrder` on the
 * contract — there is no client-side keeper. We keep the hook as a no-op so
 * existing imports don't break.
 */
export function useLimitOrderWatcher(_deps: unknown) {
  // Intentionally empty — order matching is on-chain now.
}
