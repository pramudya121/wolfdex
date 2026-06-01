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
 * Additionally wraps `send()` with a small in-flight concurrency limiter and
 * a short-lived response cache so repeated reads (e.g. balanceOf during a
 * page mount) don't burst the public RPC and get Cloudflare-blocked (429).
 */
let cached: ethers.providers.StaticJsonRpcProvider | null = null;

// --- soft rate limiter ---------------------------------------------------
const MAX_CONCURRENT = 4;
let active = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  return new Promise(resolve => {
    const tryRun = () => {
      if (active < MAX_CONCURRENT) { active++; resolve(); }
      else queue.push(tryRun);
    };
    tryRun();
  });
}
function release() {
  active = Math.max(0, active - 1);
  const next = queue.shift();
  if (next) next();
}

// --- short-lived response cache -----------------------------------------
const CACHE_TTL = 4_000; // 4s — long enough to dedupe a page mount, short enough to stay live
const responseCache = new Map<string, { value: unknown; expires: number }>();
// Only cache idempotent read methods. NEVER cache mempool / signing methods.
const CACHEABLE_METHODS = new Set([
  'eth_call', 'eth_chainId', 'net_version', 'eth_blockNumber',
  'eth_getCode', 'eth_getStorageAt', 'eth_getLogs', 'eth_gasPrice',
  'eth_getTransactionReceipt',
]);

export function getReadProvider(): ethers.providers.StaticJsonRpcProvider {
  if (!cached) {
    const p = new ethers.providers.StaticJsonRpcProvider(
      CHAIN_CONFIG.rpcUrl,
      { chainId: CHAIN_CONFIG.chainId, name: CHAIN_CONFIG.chainName },
    );
    p.pollingInterval = 12_000;

    // Wrap send() with cache + concurrency limiter + 429 backoff.
    const originalSend = p.send.bind(p);
    p.send = async (method: string, params: any[]) => {
      const key = CACHEABLE_METHODS.has(method)
        ? `${method}:${JSON.stringify(params)}`
        : null;
      if (key) {
        const hit = responseCache.get(key);
        if (hit && hit.expires > Date.now()) return hit.value as any;
      }
      await acquire();
      try {
        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const value = await originalSend(method, params);
            if (key) responseCache.set(key, { value, expires: Date.now() + CACHE_TTL });
            return value;
          } catch (err: any) {
            const msg = String(err?.message || err?.error?.message || '');
            const isRate = err?.status === 429 || msg.includes('429') ||
                           msg.includes('Bandwidth limit') || msg.toLowerCase().includes('rate limit') ||
                           msg.toLowerCase().includes('access denied');
            if (isRate && attempt < 3) {
              attempt++;
              await new Promise(r => setTimeout(r, 300 * 2 ** attempt + Math.random() * 200));
              continue;
            }
            throw err;
          }
        }
      } finally { release(); }
    };

    cached = p;
  }
  return cached;
}

/** Extract a human-friendly revert reason from any thrown RPC/contract error. */
export function decodeRpcError(e: any): string {
  if (!e) return 'Unknown error';
  const raw = String(e?.error?.message || e?.data?.message || e?.message || '');
  if (e?.status === 429 || raw.includes('429') || raw.toLowerCase().includes('access denied')) {
    return 'RPC sibuk (rate-limited Cloudflare). Tunggu beberapa detik dan coba lagi.';
  }
  if (raw.includes('Bandwidth limit exceeded') || e?.error?.code === -31002) {
    return 'RPC sibuk (bandwidth limit). Tunggu sebentar lalu coba lagi.';
  }
  const m = raw.match(/execution reverted:?\s*([^"\\]+)/i);
  if (m && m[1]) return m[1].trim();
  if (e?.reason) return e.reason;
  return raw || 'Transaction failed';
}
