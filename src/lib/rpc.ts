import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '@/config/contracts';

/**
 * Load-balanced read-only provider for the LitVM LiteForge RPC.
 *
 * - Multi-endpoint round-robin across CHAIN_CONFIG.rpcUrls
 * - 30s quarantine on RPC that returns 429 / 5xx / network error
 * - In-flight concurrency limiter (avoids Cloudflare 429 bursts)
 * - Short-lived response cache for idempotent reads (dedupes page-mount bursts)
 * - Exponential backoff on rate-limit errors before falling back to next RPC
 *
 * Uses StaticJsonRpcProvider so ethers v5 doesn't re-issue eth_chainId on every
 * call — that was hammering the public RPC and producing fake "contract reverted"
 * errors.
 */

// --- endpoint pool -------------------------------------------------------
const ENDPOINTS = (CHAIN_CONFIG.rpcUrls && CHAIN_CONFIG.rpcUrls.length > 0)
  ? CHAIN_CONFIG.rpcUrls
  : [CHAIN_CONFIG.rpcUrl];

interface EndpointState {
  provider: ethers.providers.StaticJsonRpcProvider;
  url: string;
  quarantineUntil: number; // epoch ms; 0 = healthy
  consecutiveFailures: number;
}

let pool: EndpointState[] | null = null;
let rrIndex = 0;
const QUARANTINE_MS = 30_000;

function getPool(): EndpointState[] {
  if (!pool) {
    pool = ENDPOINTS.map(url => {
      const p = new ethers.providers.StaticJsonRpcProvider(
        url,
        { chainId: CHAIN_CONFIG.chainId, name: CHAIN_CONFIG.chainName },
      );
      p.pollingInterval = 12_000;
      return { provider: p, url, quarantineUntil: 0, consecutiveFailures: 0 };
    });
  }
  return pool;
}

function pickEndpoint(): EndpointState {
  const p = getPool();
  const now = Date.now();
  // Try up to pool size to find a healthy one
  for (let i = 0; i < p.length; i++) {
    const idx = (rrIndex + i) % p.length;
    const ep = p[idx];
    if (ep.quarantineUntil <= now) {
      rrIndex = (idx + 1) % p.length;
      return ep;
    }
  }
  // All quarantined — pick the one quarantined longest ago (least bad)
  let best = p[0];
  for (const ep of p) if (ep.quarantineUntil < best.quarantineUntil) best = ep;
  return best;
}

function markFailure(ep: EndpointState) {
  ep.consecutiveFailures++;
  if (ep.consecutiveFailures >= 2) {
    ep.quarantineUntil = Date.now() + QUARANTINE_MS;
  }
}
function markSuccess(ep: EndpointState) {
  ep.consecutiveFailures = 0;
  ep.quarantineUntil = 0;
}

// --- soft rate limiter ---------------------------------------------------
const MAX_CONCURRENT = 6; // bumped slightly since load is now spread across endpoints
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
const CACHE_TTL = 4_000;
const responseCache = new Map<string, { value: unknown; expires: number }>();
const CACHEABLE_METHODS = new Set([
  'eth_call', 'eth_chainId', 'net_version', 'eth_blockNumber',
  'eth_getCode', 'eth_getStorageAt', 'eth_getLogs', 'eth_gasPrice',
  'eth_getTransactionReceipt',
]);

// --- public facade -------------------------------------------------------
let facade: ethers.providers.StaticJsonRpcProvider | null = null;

export function getReadProvider(): ethers.providers.StaticJsonRpcProvider {
  if (facade) return facade;

  // Use the first endpoint as the "type host" for ethers internals
  // (BlockNumber polling, eventing). All RPC traffic is rerouted via send().
  const primary = getPool()[0].provider;
  const originalSend = primary.send.bind(primary);

  primary.send = async (method: string, params: any[]) => {
    const key = CACHEABLE_METHODS.has(method)
      ? `${method}:${JSON.stringify(params)}`
      : null;
    if (key) {
      const hit = responseCache.get(key);
      if (hit && hit.expires > Date.now()) return hit.value as any;
    }

    await acquire();
    try {
      const poolSize = getPool().length;
      // Try each healthy endpoint up to poolSize times
      let lastErr: any = null;
      for (let attempt = 0; attempt < Math.max(poolSize, 1) + 1; attempt++) {
        const ep = pickEndpoint();
        try {
          // Route through ethers' own send for the picked endpoint
          const value = ep === getPool()[0]
            ? await originalSend(method, params)
            : await ep.provider.send(method, params);
          markSuccess(ep);
          if (key) responseCache.set(key, { value, expires: Date.now() + CACHE_TTL });
          return value;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || err?.error?.message || '');
          const isRate = err?.status === 429 || msg.includes('429') ||
                         msg.includes('Bandwidth limit') || msg.toLowerCase().includes('rate limit') ||
                         msg.toLowerCase().includes('access denied');
          const isNetwork = msg.toLowerCase().includes('network') ||
                            msg.toLowerCase().includes('failed to fetch') ||
                            err?.code === 'NETWORK_ERROR' || err?.code === 'TIMEOUT';
          if (isRate || isNetwork) {
            markFailure(ep);
            // brief backoff before trying next endpoint
            await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
            continue;
          }
          // Non-retryable (e.g. revert) — surface immediately
          throw err;
        }
      }
      throw lastErr ?? new Error('All RPC endpoints failed');
    } finally { release(); }
  };

  facade = primary;
  return facade;
}

/** Extract a human-friendly revert reason from any thrown RPC/contract error. */
export function decodeRpcError(e: any): string {
  if (!e) return 'Unknown error';
  const raw = String(e?.error?.message || e?.data?.message || e?.message || '');
  if (e?.status === 429 || raw.includes('429') || raw.toLowerCase().includes('access denied')) {
    return 'RPC sibuk (rate-limited). Tunggu beberapa detik dan coba lagi.';
  }
  if (raw.includes('Bandwidth limit exceeded') || e?.error?.code === -31002) {
    return 'RPC sibuk (bandwidth limit). Tunggu sebentar lalu coba lagi.';
  }
  const m = raw.match(/execution reverted:?\s*([^"\\]+)/i);
  if (m && m[1]) return m[1].trim();
  if (e?.reason) return e.reason;
  return raw || 'Transaction failed';
}
