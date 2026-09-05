import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS } from '@/config/contracts';

/**
 * Shared (database-backed) list of external DEX routers tracked by the admin
 * console. Reads are public; writes require a signature from the wallet that
 * owns the DexAggregatorRouter contract on-chain.
 */
const writeSchema = z.object({
  address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid router address'),
  label: z.string().trim().min(1).max(64),
  remove: z.boolean().optional(),
  timestamp: z.number().int(),
  signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, 'Invalid signature'),
});

export type AdminRouterInput = z.input<typeof writeSchema>;

/** Message the admin wallet must sign (kept in sync with the client). */
export function buildRouterMessage(address: string, timestamp: number) {
  return `WolfDex Admin\nTrack router: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
}

async function readAggregatorOwner(): Promise<string> {
  const res = await fetch(CHAIN_CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: CONTRACTS.AGGREGATOR, data: '0x8da5cb5b' }, 'latest'],
    }),
  });
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (!json.result || json.result.length < 66) {
    throw new Error(json.error?.message || 'Could not read contract owner');
  }
  return ('0x' + json.result.slice(-40)).toLowerCase();
}

export const listAggregatorRouters = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('aggregator_routers')
    .select('address, label')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({ address: r.address, label: r.label }));
});

export const saveAggregatorRouter = createServerFn({ method: 'POST' })
  .inputValidator((input: AdminRouterInput) => writeSchema.parse(input))
  .handler(async ({ data }) => {
    if (Math.abs(Date.now() - data.timestamp) > 10 * 60 * 1000) {
      throw new Error('Signature expired — please sign again');
    }
    let signer: string;
    try {
      signer = ethers.utils
        .verifyMessage(buildRouterMessage(data.address, data.timestamp), data.signature)
        .toLowerCase();
    } catch {
      throw new Error('Invalid signature');
    }
    const owner = await readAggregatorOwner();
    if (signer !== owner) throw new Error('Only the contract owner can manage routers');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const address = data.address.toLowerCase();
    if (data.remove) {
      const { error } = await supabaseAdmin.from('aggregator_routers').delete().eq('address', address);
      if (error) throw new Error(error.message);
      return { ok: true as const, removed: true as const, address };
    }
    const { error } = await supabaseAdmin
      .from('aggregator_routers')
      .upsert({ address, label: data.label }, { onConflict: 'address' });
    if (error) throw new Error(error.message);
    return { ok: true as const, removed: false as const, address };
  });
