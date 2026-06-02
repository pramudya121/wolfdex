/**
 * useLaunchpadRegistry — public, cross-device registry of launchpad tokens.
 * Stores name/symbol/decimals/logo_url in Supabase so every visitor sees the
 * real token info (not just the deploying browser).
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { TokenInfo } from '@/config/contracts';

export interface RegistryToken {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_url: string | null;
  creator: string | null;
  verified?: boolean;
}

const memCache: Map<string, RegistryToken> = new Map();
let listSubscribers: Array<() => void> = [];

function notify() { listSubscribers.forEach(fn => { try { fn(); } catch {} }); }

const ALLOWED_LOGO_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp',
};
const MAX_LOGO_BYTES = 512 * 1024;

export async function uploadTokenLogo(file: File, address: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safeMime = ALLOWED_LOGO_MIME[ext];
  if (!safeMime) throw new Error('Unsupported image type. Use PNG, JPG, GIF, or WEBP.');
  if (file.size > MAX_LOGO_BYTES) throw new Error('Logo too large (max 512 KB).');
  const path = `${address.toLowerCase()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('token-logos').upload(path, file, {
    cacheControl: '31536000',
    upsert: true,
    // Use server-validated MIME, NOT caller-controlled file.type
    contentType: safeMime,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('token-logos').getPublicUrl(path);
  return data.publicUrl;
}

export async function registerToken(t: Omit<RegistryToken, 'creator'> & { creator?: string | null }) {
  const row = {
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    logo_url: t.logo_url ?? null,
    creator: t.creator ?? null,
  };
  const { error } = await supabase.from('launchpad_tokens').upsert(row, { onConflict: 'address' });
  if (error) throw error;
  memCache.set(row.address.toLowerCase(), row as RegistryToken);
  notify();
}

export function useLaunchpadRegistry() {
  const [tokens, setTokens] = useState<RegistryToken[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('launchpad_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) {
      memCache.clear();
      data.forEach(r => memCache.set(r.address.toLowerCase(), r as RegistryToken));
      setTokens(data as RegistryToken[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const sub = () => setTokens(Array.from(memCache.values()));
    listSubscribers.push(sub);
    // Realtime: any insert refreshes everywhere.
    // Use a unique channel name per mount so StrictMode double-mount /
    // hot-reload never re-subscribes a torn-down channel (which throws
    // "cannot add postgres_changes callbacks after subscribe()").
    const channel = supabase.channel(`launchpad_tokens_changes_${Math.random().toString(36).slice(2)}`);
    channel
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'launchpad_tokens' },
        () => refresh(),
      )
      .subscribe();
    return () => {
      listSubscribers = listSubscribers.filter(s => s !== sub);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { tokens, loading, refresh };
}

/** Synchronous lookup from the in-memory cache (fed by useLaunchpadRegistry). */
export function getRegistryToken(address: string): RegistryToken | undefined {
  return memCache.get(address.toLowerCase());
}

/** Convert registry row → TokenInfo for swap/token modals. */
export function registryToTokenInfo(r: RegistryToken): TokenInfo {
  return {
    address: r.address,
    symbol: r.symbol,
    name: r.name,
    decimals: r.decimals,
    logo: r.logo_url || '/images/wdex-logo.png',
  };
}
