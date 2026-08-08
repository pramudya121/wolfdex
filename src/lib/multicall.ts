import { ethers } from 'ethers';
import { getReadProvider } from './rpc';
import { CONTRACTS } from '@/config/contracts';

/**
 * Multicall3-style aggregator: batch many read-only contract calls into a
 * single eth_call to slash RPC traffic by 10-50x on pages like Pools, Analytics,
 * and Portfolio that fan out hundreds of balanceOf/getReserves reads.
 *
 * Falls back gracefully to per-call execution if the multicall contract isn't
 * deployed or reverts as a whole.
 */

const MULTICALL_ABI = [
  // Multicall3 standard
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)',
  // Multicall2
  'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) returns ((bool success, bytes returnData)[] returnData)',
  // Multicall1 (all-or-nothing)
  'function aggregate((address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returnData)',
];

/** Batching flavour supported by the deployed aggregator; probed once per session. */
type Flavour = 'aggregate3' | 'tryAggregate' | 'aggregate' | 'single';
let flavour: Flavour | null = null;


export interface Call {
  target: string;
  abi: ethers.utils.Interface | readonly string[] | any[];
  functionName: string;
  args?: any[];
  /** If false, a single revert won't abort the whole batch. Default false. */
  required?: boolean;
}

export interface CallResult<T = any> {
  success: boolean;
  result: T | null;
  error?: string;
}

function getInterface(abi: Call['abi']): ethers.utils.Interface {
  if (abi instanceof ethers.utils.Interface) return abi;
  return new ethers.utils.Interface(abi as any);
}

interface Encoded {
  target: string;
  allowFailure: boolean;
  callData: string;
}
interface RawResult {
  success: boolean;
  returnData: string;
}

/** One-by-one execution — last resort, still parallel. */
async function execSingle(
  provider: ReturnType<typeof getReadProvider>,
  encoded: Encoded[],
): Promise<RawResult[]> {
  return Promise.all(
    encoded.map(async e => {
      try {
        return { success: true, returnData: await provider.call({ to: e.target, data: e.callData }) };
      } catch {
        return { success: false, returnData: '0x' };
      }
    }),
  );
}

/**
 * Run one encoded batch, adapting to whichever aggregator flavour the chain's
 * multicall contract actually implements (Multicall3 / 2 / 1). Multicall1's
 * `aggregate` is all-or-nothing, so a revert is handled by splitting the batch
 * in half recursively — a single bad target then costs log(n) calls instead of n.
 */
async function execBatch(
  mc: ethers.Contract,
  provider: ReturnType<typeof getReadProvider>,
  encoded: Encoded[],
): Promise<RawResult[]> {
  if (encoded.length === 0) return [];

  if (flavour === null) {
    const probe = encoded.slice(0, 1);
    for (const f of ['aggregate3', 'tryAggregate', 'aggregate'] as const) {
      try {
        if (f === 'aggregate3') await mc.callStatic.aggregate3(probe);
        else if (f === 'tryAggregate') await mc.callStatic.tryAggregate(false, probe.map(stripFlag));
        else await mc.callStatic.aggregate(probe.map(stripFlag));
        flavour = f;
        break;
      } catch { /* try next flavour */ }
    }
    if (flavour === null) flavour = 'single';
  }

  if (flavour === 'single') return execSingle(provider, encoded);

  try {
    if (flavour === 'aggregate3') {
      const raw = await mc.callStatic.aggregate3(encoded);
      return raw.map((r: RawResult) => ({ success: r.success, returnData: r.returnData }));
    }
    if (flavour === 'tryAggregate') {
      const raw = await mc.callStatic.tryAggregate(false, encoded.map(stripFlag));
      return raw.map((r: RawResult) => ({ success: r.success, returnData: r.returnData }));
    }
    const res = await mc.callStatic.aggregate(encoded.map(stripFlag));
    return (res.returnData as string[]).map(d => ({ success: d !== '0x', returnData: d }));
  } catch {
    if (encoded.length === 1) return execSingle(provider, encoded);
    const mid = Math.ceil(encoded.length / 2);
    const [a, b] = await Promise.all([
      execBatch(mc, provider, encoded.slice(0, mid)),
      execBatch(mc, provider, encoded.slice(mid)),
    ]);
    return [...a, ...b];
  }
}

function stripFlag(e: Encoded) {
  return { target: e.target, callData: e.callData };
}


 * Execute many read calls in one RPC round-trip via Multicall3.
 * @param calls list of {target, abi, functionName, args}
 * @param chunkSize split into batches of this many to stay under gas limit (default 200)
 */
export async function multicall<T = any>(
  calls: Call[],
  chunkSize = 200,
): Promise<CallResult<T>[]> {
  if (calls.length === 0) return [];
  const provider = getReadProvider();
  const mc = new ethers.Contract(CONTRACTS.MULTICALL, MULTICALL_ABI, provider);

  const results: CallResult<T>[] = new Array(calls.length);

  for (let offset = 0; offset < calls.length; offset += chunkSize) {
    const slice = calls.slice(offset, offset + chunkSize);
    const ifaces = slice.map(c => getInterface(c.abi));
    const encoded = slice.map((c, i) => ({
      target: c.target,
      allowFailure: c.required === true ? false : true,
      callData: ifaces[i].encodeFunctionData(c.functionName, c.args ?? []),
    }));

    const raw = await execBatch(mc, provider, encoded);


    raw.forEach((r, i) => {
      if (!r.success || !r.returnData || r.returnData === '0x') {
        results[offset + i] = { success: false, result: null, error: 'call reverted' };
        return;
      }
      try {
        const decoded = ifaces[i].decodeFunctionResult(slice[i].functionName, r.returnData);
        // Unwrap single-value returns for ergonomics
        results[offset + i] = {
          success: true,
          result: (decoded.length === 1 ? decoded[0] : decoded) as T,
        };
      } catch (e: any) {
        results[offset + i] = { success: false, result: null, error: e?.message ?? 'decode failed' };
      }
    });
  }

  return results;
}

/** Convenience: batch ERC20 metadata (name/symbol/decimals) for many tokens. */
const ERC20_META_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];
export async function batchErc20Metadata(addresses: string[]) {
  const calls: Call[] = addresses.flatMap(addr => ([
    { target: addr, abi: ERC20_META_ABI, functionName: 'name' },
    { target: addr, abi: ERC20_META_ABI, functionName: 'symbol' },
    { target: addr, abi: ERC20_META_ABI, functionName: 'decimals' },
  ]));
  const res = await multicall(calls);
  return addresses.map((addr, i) => ({
    address: addr,
    name: res[i * 3]?.result as string | null,
    symbol: res[i * 3 + 1]?.result as string | null,
    decimals: (res[i * 3 + 2]?.result as number | null) ?? null,
  }));
}
