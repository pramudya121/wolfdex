import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, CONTRACTS } from '@/config/contracts';

/**
 * Owner-gated token curation.
 *
 * The caller signs a short-lived message with the wallet that owns the
 * DexAggregatorRouter contract. The server recovers the signer, compares it to
 * the on-chain `owner()` of the aggregator, and only then writes the token with
 * `verified = true` using the service-role client (the DB trigger forces
 * verified=false for every non-service_role writer).
 */
const schema = z.object({
  address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid token address'),
  name: z.string().trim().min(1).max(64),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z0-9]+$/, 'Symbol must be alphanumeric'),
  decimals: z.number().int().min(0).max(18),
  logoUrl: z.string().trim().url().startsWith('https://').max(500).optional().or(z.literal('')),
  timestamp: z.number().int(),
  signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, 'Invalid signature'),
});

export type AdminTokenInput = z.input<typeof schema>;

/** Message the admin wallet must sign (kept in sync with the client). */
export function buildVerifyMessage(address: string, timestamp: number) {
  return `WolfDex Admin\nVerify token: ${address.toLowerCase()}\nTimestamp: ${timestamp}`;
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

export const registerVerifiedToken = createServerFn({ method: 'POST' })
  .inputValidator((input: AdminTokenInput) => schema.parse(input))
  .handler(async ({ data }) => {
    const age = Math.abs(Date.now() - data.timestamp);
    if (age > 10 * 60 * 1000) throw new Error('Signature expired — please sign again');

    let signer: string;
    try {
      signer = ethers.utils
        .verifyMessage(buildVerifyMessage(data.address, data.timestamp), data.signature)
        .toLowerCase();
    } catch {
      throw new Error('Invalid signature');
    }

    const owner = await readAggregatorOwner();
    if (signer !== owner) throw new Error('Only the contract owner can verify tokens');

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('launchpad_tokens').upsert(
      {
        address: data.address.toLowerCase(),
        name: data.name,
        symbol: data.symbol,
        decimals: data.decimals,
        logo_url: data.logoUrl || null,
        creator: signer,
        verified: true,
      },
      { onConflict: 'address' },
    );
    if (error) throw new Error(error.message || 'Could not save token');

    return { ok: true as const, address: data.address.toLowerCase() };
  });
