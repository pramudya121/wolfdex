import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS } from '@/config/contracts';

/**
 * Ecosystem directory (shared database). Reads are public; writes require a
 * signature from the wallet that owns the DexAggregatorRouter contract, i.e.
 * the protocol owner wallet.
 */
const writeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(64),
  url: z.string().trim().url().max(300).refine(u => /^https:\/\//i.test(u), 'Website must start with https://'),
  logo_url: z.string().trim().url().max(500).refine(u => /^https:\/\//i.test(u), 'Logo must be an https link').optional().or(z.literal('')),
  description: z.string().trim().max(280).optional().or(z.literal('')),
  category: z.string().trim().min(1).max(32).default('DeFi'),
  remove: z.boolean().optional(),
  timestamp: z.number().int(),
  signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, 'Invalid signature'),
});

export type EcosystemInput = z.input<typeof writeSchema>;

export interface EcosystemDapp {
  id: string;
  name: string;
  url: string;
  logo_url: string | null;
  description: string | null;
  category: string;
}

/** Message the owner wallet must sign (kept in sync with the client). */
export function buildEcosystemMessage(name: string, url: string, timestamp: number) {
  return `WolfDex Ecosystem\nEntry: ${name} — ${url}\nTimestamp: ${timestamp}`;
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

export const listEcosystemDapps = createServerFn({ method: 'GET' }).handler(async (): Promise<EcosystemDapp[]> => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('ecosystem_dapps')
    .select('id, name, url, logo_url, description, category')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EcosystemDapp[];
});

export const saveEcosystemDapp = createServerFn({ method: 'POST' })
  .inputValidator((input: EcosystemInput) => writeSchema.parse(input))
  .handler(async ({ data }) => {
    if (Math.abs(Date.now() - data.timestamp) > 10 * 60 * 1000) {
      throw new Error('Signature expired — please sign again');
    }
    let signer: string;
    try {
      signer = ethers.utils
        .verifyMessage(buildEcosystemMessage(data.name, data.url, data.timestamp), data.signature)
        .toLowerCase();
    } catch {
      throw new Error('Invalid signature');
    }
    const owner = await readAggregatorOwner();
    if (signer !== owner) throw new Error('Only the owner wallet can manage the ecosystem list');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    if (data.remove) {
      if (!data.id) throw new Error('Missing entry id');
      const { error } = await supabaseAdmin.from('ecosystem_dapps').delete().eq('id', data.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, removed: true as const };
    }

    const row = {
      name: data.name,
      url: data.url,
      logo_url: data.logo_url ? data.logo_url : null,
      description: data.description ? data.description : null,
      category: data.category || 'DeFi',
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from('ecosystem_dapps').update(row).eq('id', data.id);
      if (error) throw new Error(error.message);
      return { ok: true as const, removed: false as const };
    }
    const { error } = await supabaseAdmin.from('ecosystem_dapps').insert(row);
    if (error) throw new Error(error.message);
    return { ok: true as const, removed: false as const };
  });
