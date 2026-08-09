import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useServerFn } from '@tanstack/react-start';
import { CheckCircle2, Loader2, Mail, MessageSquare, Send, Sparkles, Wallet } from 'lucide-react';
import { DNS_TLD } from '@/config/contracts';
import { submitDomainRequest } from '@/lib/domains.functions';
import { useDexContext } from '@/context/DexContext';

type Errors = Partial<Record<'domainName' | 'email' | 'walletAddress' | 'message', string>>;

const NAME_RE = /^[a-z0-9-]+$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * DomainRequestForm — lead capture for premium / bulk / brand `.wolf` names.
 * Client-side validation mirrors the server Zod schema; on success the panel
 * flips to a confirmation state instead of clearing silently.
 */
export default function DomainRequestForm({ presetName = '' }: { presetName?: string }) {
  const { wallet } = useDexContext();
  const submit = useServerFn(submitDomainRequest);

  const [domainName, setDomainName] = useState(presetName);
  const [email, setEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: Errors = {};
    const name = domainName.trim().toLowerCase();
    if (name.length < 3) next.domainName = 'At least 3 characters';
    else if (name.length > 63) next.domainName = 'Too long (max 63)';
    else if (!NAME_RE.test(name)) next.domainName = 'Only a-z, 0-9 and hyphens';

    const mail = email.trim();
    if (!mail) next.email = 'Email is required';
    else if (!EMAIL_RE.test(mail) || mail.length > 255) next.email = 'Enter a valid email address';

    const addr = walletAddress.trim();
    if (addr && !ADDR_RE.test(addr)) next.walletAddress = 'Must be a 0x… address (42 chars)';

    if (message.length > 1000) next.message = 'Max 1000 characters';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const res = await submit({
        data: {
          domainName: domainName.trim().toLowerCase(),
          email: email.trim(),
          walletAddress: walletAddress.trim(),
          message: message.trim(),
        },
      });
      setDone(res.domain);
    } catch (err: any) {
      setServerError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'h-11 w-full rounded-xl border border-wolf-border/40 bg-background/70 px-3 text-sm font-medium text-foreground outline-none transition focus:border-wolf-pink/60 focus:ring-2 focus:ring-wolf-pink/25';

  return (
    <section id="domain-request" className="mt-16">
      <div className="mb-5 text-center">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">
          <Sparkles className="h-3.5 w-3.5" /> Concierge
        </div>
        <h2 className="mt-2 text-lg font-black text-foreground sm:text-2xl">
          Request a premium or brand name
        </h2>
        <p className="mx-auto mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
          Want a taken name, a bulk batch, or help wiring records for your project? Send a request
          and the WolfDex team will get back to you by email.
        </p>
      </div>

      <div className="mx-auto max-w-2xl rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/60 via-background to-wolf-surface/20 p-5 sm:p-7">
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="py-6 text-center"
            >
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-wolf-pink/40 bg-wolf-pink/10">
                <CheckCircle2 className="h-7 w-7 text-wolf-pink" />
              </div>
              <h3 className="mt-4 text-base font-black text-foreground">Request received</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                We saved your request for <span className="font-bold text-wolf-pink">{done}</span>{' '}
                and sent it to the team. Watch your inbox at{' '}
                <span className="font-semibold text-foreground">{email.trim()}</span>.
              </p>
              <button
                onClick={() => {
                  setDone(null);
                  setDomainName('');
                  setMessage('');
                }}
                className="mt-5 rounded-xl border border-wolf-border/40 bg-wolf-surface/60 px-4 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink"
              >
                Send another request
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onSubmit={onSubmit}
              className="space-y-4"
              noValidate
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="dr-name" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Desired name
                  </label>
                  <div className="relative">
                    <input
                      id="dr-name"
                      value={domainName}
                      onChange={e =>
                        setDomainName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                      }
                      placeholder="yourbrand"
                      maxLength={63}
                      spellCheck={false}
                      className={`${inputCls} pr-16`}
                      aria-invalid={!!errors.domainName}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-wolf-pink">
                      .{DNS_TLD}
                    </span>
                  </div>
                  {errors.domainName && (
                    <p className="mt-1 text-[11px] font-semibold text-destructive">{errors.domainName}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="dr-email" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="dr-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@project.xyz"
                      maxLength={255}
                      className={`${inputCls} pl-9`}
                      aria-invalid={!!errors.email}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-[11px] font-semibold text-destructive">{errors.email}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="dr-wallet" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Wallet address <span className="font-medium normal-case tracking-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Wallet className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="dr-wallet"
                    value={walletAddress}
                    onChange={e => setWalletAddress(e.target.value)}
                    placeholder={wallet.address || '0x…'}
                    maxLength={42}
                    spellCheck={false}
                    className={`${inputCls} pl-9 pr-24 font-mono`}
                    aria-invalid={!!errors.walletAddress}
                  />
                  {wallet.address && !walletAddress && (
                    <button
                      type="button"
                      onClick={() => setWalletAddress(wallet.address!)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-wolf-border/40 bg-wolf-surface/70 px-2 py-1 text-[10px] font-bold text-wolf-pink"
                    >
                      Use mine
                    </button>
                  )}
                </div>
                {errors.walletAddress && (
                  <p className="mt-1 text-[11px] font-semibold text-destructive">{errors.walletAddress}</p>
                )}
              </div>

              <div>
                <label htmlFor="dr-msg" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Details <span className="font-medium normal-case tracking-normal">(optional)</span>
                </label>
                <div className="relative">
                  <MessageSquare className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground" />
                  <textarea
                    id="dr-msg"
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="Tell us about your project, how many names you need, or which records you want configured."
                    className="w-full rounded-xl border border-wolf-border/40 bg-background/70 py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-wolf-pink/60 focus:ring-2 focus:ring-wolf-pink/25"
                    aria-invalid={!!errors.message}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-destructive">{errors.message}</span>
                  <span className="text-[10px] text-muted-foreground">{message.length}/1000</span>
                </div>
              </div>

              {serverError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-semibold text-destructive">
                  {serverError}
                </div>
              )}

              <motion.button
                type="submit"
                disabled={busy}
                whileHover={{ y: busy ? 0 : -2 }}
                whileTap={{ scale: 0.98 }}
                className="wolf-btn-primary flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Sending…</>
                ) : (
                  <><Send className="h-4 w-4" />Send request</>
                )}
              </motion.button>
              <p className="text-center text-[10px] text-muted-foreground">
                We only use your email to reply to this request.
              </p>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
