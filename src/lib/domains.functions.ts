import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Lead capture for `.wolf` domain requests.
 *
 * Validation runs server-side with Zod (the RLS policy enforces the same
 * bounds as a second layer). After a successful insert we optionally POST the
 * lead to `DOMAIN_REQUEST_WEBHOOK_URL` (Zapier / Slack / email relay) — the
 * webhook is best-effort and never blocks the user's success state.
 */
const requestSchema = z.object({
  domainName: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Name must be at least 3 characters')
    .max(63, 'Name is too long')
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, digits and hyphens'),
  email: z.string().trim().email('Enter a valid email address').max(255),
  walletAddress: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid wallet address')
    .optional()
    .or(z.literal('')),
  message: z.string().trim().max(1000, 'Message is too long').optional().or(z.literal('')),
});

export type DomainRequestInput = z.input<typeof requestSchema>;

export const submitDomainRequest = createServerFn({ method: 'POST' })
  .inputValidator((input: DomainRequestInput) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const url = process.env['SUPABASE_URL']!;
    const key =
      process.env['SUPABASE_PUBLISHABLE_KEY'] || process.env['SUPABASE_ANON_KEY'] || '';

    const supabase = createClient<Database>(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith('sb_') && h.get('Authorization') === `Bearer ${key}`) {
            h.delete('Authorization');
          }
          h.set('apikey', key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { error } = await supabase.from('domain_requests').insert({
      domain_name: data.domainName,
      email: data.email,
      wallet_address: data.walletAddress || null,
      message: data.message || null,
    });

    if (error) {
      console.error('[domain-request] insert failed', error.message);
      throw new Error('Could not save your request. Please try again.');
    }

    const hook = process.env['DOMAIN_REQUEST_WEBHOOK_URL'];
    if (hook) {
      try {
        const res = await fetch(hook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'domain_request',
            domain: `${data.domainName}.wolf`,
            email: data.email,
            wallet: data.walletAddress || null,
            message: data.message || null,
            at: new Date().toISOString(),
          }),
        });
        if (!res.ok) {
          console.error(`[domain-request] webhook failed [${res.status}]: ${await res.text()}`);
        }
      } catch (err) {
        console.error('[domain-request] webhook error', err);
      }
    }

    return { ok: true as const, domain: `${data.domainName}.wolf` };
  });
