import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet as WalletIcon,
  Search,
  Sparkles,
  ShieldCheck,
  Globe,
  Repeat,
  Coins,
  ChevronDown,
  Crown,
} from 'lucide-react';
import { DNS_TLD, CHAIN_CONFIG } from '@/config/contracts';

/**
 * DomainsPerks — marketing/education band for the Domains page.
 * Purely presentational: benefits grid, 3-step how-it-works, pricing tiers
 * and an FAQ accordion. Motion is subtle and respects the global
 * prefers-reduced-motion rules in src/styles.css.
 */

const PERKS = [
  {
    icon: WalletIcon,
    title: 'Replace your address',
    body: `Your .${DNS_TLD} name shows up instead of 0x… across WolfDex — swaps, pools, farming and your wallet chip.`,
  },
  {
    icon: ShieldCheck,
    title: 'You truly own it',
    body: 'Every domain is an ERC-721 NFT held in your wallet. No middleman can revoke, freeze or reassign it.',
  },
  {
    icon: Globe,
    title: 'One identity, many records',
    body: 'Attach an avatar, website, email, Twitter and bio on-chain — a portable Web3 profile any app can read.',
  },
  {
    icon: Repeat,
    title: 'Transferable & renewable',
    body: 'Send it like any NFT, extend it any time, or hold it long term. Expiry is always visible on your card.',
  },
] as const;

const STEPS = [
  { icon: Search, title: 'Search', body: `Type a name and we check the registry on-chain instantly.` },
  { icon: Coins, title: 'Confirm cost', body: 'See registration price plus estimated gas before you sign.' },
  { icon: Sparkles, title: 'Mint & shine', body: 'Commit + register in one flow, then pin it as your primary name.' },
] as const;

const TIERS = [
  { len: '3 characters', price: '$100 / yr', label: 'Ultra Rare', accent: 'from-amber-400 to-rose-500' },
  { len: '4 characters', price: '$50 / yr', label: 'Rare', accent: 'from-orange-400 to-pink-500' },
  { len: '5+ characters', price: '$5 / yr', label: 'Standard', accent: 'from-fuchsia-400 to-purple-500' },
] as const;

const FAQ = [
  {
    q: `What exactly is a .${DNS_TLD} domain?`,
    a: `It is an NFT name registered on the WolfDex Name Service, deployed on ${CHAIN_CONFIG.chainName}. The name maps to your wallet address, so apps can show "yourname.${DNS_TLD}" instead of a long hex address.`,
  },
  {
    q: 'How is the price calculated?',
    a: 'Shorter names are scarcer, so they cost more per year. The exact amount is quoted by the registrar contract at checkout, and you also pay network gas for the commit and register transactions.',
  },
  {
    q: 'Why two transactions?',
    a: 'Registration uses a commit-reveal flow. The first transaction publishes a hidden commitment so nobody can front-run your name, and the second one finalises the registration.',
  },
  {
    q: 'What happens when a domain expires?',
    a: 'You keep full control until the expiry date and can renew at any time from the My Domains section. After expiry the name becomes available for anyone to register again.',
  },
  {
    q: 'Can I move a domain to another wallet?',
    a: 'Yes. Use Send on the domain card to transfer the NFT. The new owner inherits the name and can update its records.',
  },
] as const;

export default function DomainsPerks({ onPick }: { onPick?: (name: string) => void }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="mt-16 space-y-14">
      {/* Why own one */}
      <section>
        <div className="mb-5 text-center">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">
            <Crown className="h-3.5 w-3.5" /> Why claim a name
          </div>
          <h2 className="mt-2 text-lg font-black text-foreground sm:text-2xl">
            More than a name — your Web3 passport
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/60 via-background to-wolf-surface/20 p-5"
            >
              <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-wolf-pink/10 blur-2xl transition group-hover:bg-wolf-pink/25" />
              <div className="relative grid h-10 w-10 place-items-center rounded-2xl border border-wolf-border/40 bg-background/60">
                <p.icon className="h-4.5 w-4.5 text-wolf-pink" />
              </div>
              <h3 className="relative mt-3 text-sm font-black text-foreground">{p.title}</h3>
              <p className="relative mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className="mb-5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">How it works</div>
          <h2 className="mt-2 text-lg font-black text-foreground sm:text-2xl">Minted in three steps</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-3xl border border-wolf-border/40 bg-wolf-surface/40 p-5"
            >
              <span className="absolute right-4 top-3 text-3xl font-black text-wolf-pink/15">{i + 1}</span>
              <s.icon className="h-5 w-5 text-wolf-pink" />
              <h3 className="mt-3 text-sm font-black text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing tiers */}
      <section>
        <div className="mb-5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">Pricing</div>
          <h2 className="mt-2 text-lg font-black text-foreground sm:text-2xl">Shorter name, bolder flex</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map(t => (
            <div
              key={t.len}
              className="group relative overflow-hidden rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/60 to-background p-5 text-center transition hover:border-wolf-pink/50"
            >
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${t.accent} px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white`}
              >
                {t.label}
              </span>
              <div className="mt-3 text-2xl font-black wolf-gradient-text">{t.price}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t.len}</div>
              {onPick && (
                <button
                  onClick={() => onPick('')}
                  className="mt-4 w-full rounded-xl border border-wolf-border/40 bg-background/60 py-2 text-[11px] font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink"
                >
                  Search a name
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <div className="mb-5 text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">FAQ</div>
          <h2 className="mt-2 text-lg font-black text-foreground sm:text-2xl">Good to know</h2>
        </div>
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-wolf-border/40 bg-wolf-surface/40">
          {FAQ.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="border-b border-wolf-border/30 last:border-b-0">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold text-foreground transition hover:bg-wolf-surface/60"
                  aria-expanded={isOpen}
                >
                  {f.q}
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-wolf-pink transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-4 text-xs leading-relaxed text-muted-foreground">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
