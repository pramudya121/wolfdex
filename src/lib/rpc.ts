import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '@/config/contracts';

/**
 * Singleton read-only provider for the LitVM LiteForge RPC.
 *
 * Uses StaticJsonRpcProvider so ethers v5 does NOT re-issue eth_chainId /
 * net_version on every contract call — that pattern was hammering the public
 * Caldera RPC and triggering 429 "Bandwidth limit exceeded" errors which the
 * UI then misreported as "contract reverted".
 *
 * Always import this instead of `new ethers.providers.JsonRpcProvider(...)`.
 */
let cached: ethers.providers.StaticJsonRpcProvider | null = null;

export function getReadProvider(): ethers.providers.StaticJsonRpcProvider {
  if (!cached) {
    cached = new ethers.providers.StaticJsonRpcProvider(
      CHAIN_CONFIG.rpcUrl,
      { chainId: CHAIN_CONFIG.chainId, name: CHAIN_CONFIG.chainName },
    );
    // Slow ethers' poll loop — we don't rely on its internal block subscription.
    cached.pollingInterval = 12_000;
  }
  return cached;
}

/** Extract a human-friendly revert reason from any thrown RPC/contract error. */
export function decodeRpcError(e: any): string {
  if (!e) return 'Unknown error';
  // Caldera bandwidth gate
  const raw = String(e?.error?.message || e?.data?.message || e?.message || '');
  if (raw.includes('Bandwidth limit exceeded') || e?.error?.code === -31002) {
    return 'RPC sibuk (bandwidth limit). Tunggu sebentar lalu coba lagi.';
  }
  // Solidity require strings — pattern: "execution reverted: <reason>"
  const m = raw.match(/execution reverted:?\s*([^"\\]+)/i);
  if (m && m[1]) return m[1].trim();
  if (e?.reason) return e.reason;
  return raw || 'Transaction failed';
}
