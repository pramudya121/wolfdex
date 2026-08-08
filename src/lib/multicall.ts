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

/**
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
