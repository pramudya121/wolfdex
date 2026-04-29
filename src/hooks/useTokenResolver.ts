/**
 * useTokenResolver — best-effort resolver that maps a token address to its
 * symbol/name/decimals/logo, falling back to on-chain ERC20 calls when the
 * token is not in the static TOKENS list nor in the user's customTokens.
 *
 * Cached in-memory (module-scope) + localStorage so subsequent page loads
 * are instant. Returns a sync `resolve(addr)` that gives the best-known info
 * immediately and triggers a background fetch if needed.
 */
import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, TOKENS, getTokenByAddress, type TokenInfo } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';
import { useCustomTokens } from './useCustomTokens';

const STORAGE_KEY = 'wolfdex.tokenResolverCache.v1';
const memCache: Map<string, TokenInfo> = new Map();
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, TokenInfo>;
      Object.entries(parsed).forEach(([k, v]) => memCache.set(k.toLowerCase(), v));
    }
  } catch {}
}
function persist() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, TokenInfo> = {};
    memCache.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

export function useTokenResolver() {
  const { customTokens } = useCustomTokens();
  const [, force] = useState(0);

  useEffect(() => { hydrate(); }, []);

  const resolve = useCallback((address: string): TokenInfo => {
    if (!address) return { address: '0x0', symbol: '?', name: '?', decimals: 18, logo: '' };
    const key = address.toLowerCase();

    // 1. Static list
    const fromStatic = getTokenByAddress(address);
    if (fromStatic) return fromStatic;

    // 2. Custom (user-imported)
    const custom = customTokens.find(t => t.address.toLowerCase() === key);
    if (custom) return custom;

    // 3. In-memory cache
    const cached = memCache.get(key);
    if (cached) return cached;

    // 4. Fallback placeholder + background fetch
    const placeholder: TokenInfo = {
      address,
      symbol: address.slice(0, 6) + '…' + address.slice(-4),
      name: 'Unknown token',
      decimals: 18,
      logo: '',
    };
    // fire-and-forget on-chain resolution
    (async () => {
      try {
        const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
        const c = new ethers.Contract(address, ERC20_ABI, provider);
        const [sym, nm, dec] = await Promise.all([
          c.symbol().catch(() => null),
          c.name().catch(() => null),
          c.decimals().catch(() => 18),
        ]);
        if (!sym) return;
        const info: TokenInfo = {
          address,
          symbol: String(sym),
          name: String(nm || sym),
          decimals: Number(dec) || 18,
          logo: '',
        };
        memCache.set(key, info);
        persist();
        force(n => n + 1);
      } catch { /* ignore */ }
    })();
    return placeholder;
  }, [customTokens]);

  return { resolve };
}

/** All tokens currently known to the app (static + custom + resolved cache). */
export function useAllKnownTokens(): TokenInfo[] {
  const { customTokens } = useCustomTokens();
  hydrate();
  const cached: TokenInfo[] = [];
  memCache.forEach(v => {
    if (!TOKENS.some(t => t.address.toLowerCase() === v.address.toLowerCase()) &&
        !customTokens.some(t => t.address.toLowerCase() === v.address.toLowerCase())) {
      cached.push(v);
    }
  });
  return [...TOKENS, ...customTokens, ...cached];
}
