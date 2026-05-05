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
}

const memCache: Map<string, RegistryToken> = new Map();
let listSubscribers: Array<() => void> = [];

function notify() { listSubscribers.forEach(fn => { try { fn(); } catch {} }); }

export async function uploadTokenLogo(file: File, address: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${address.toLowerCase()}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('token-logos').upload(path, file, {
    cacheControl: '31536000',
    upsert: true,
    contentType: file.type || 'image/png',
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
    // IMPORTANT: .on() MUST be called before .subscribe() — chaining
    // .subscribe() inline causes "cannot add postgres_changes callbacks
    // for realtime:* after subscribe()" on hot-reload / re-mount.
    const channel = supabase.channel('launchpad_tokens_changes');
    channel.on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'launchpad_tokens' },
      () => refresh(),
    );
    channel.subscribe();
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
