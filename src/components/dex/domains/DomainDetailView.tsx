import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Twitter,
  Wallet as WalletIcon,
} from 'lucide-react';
import { CHAIN_CONFIG, CONTRACTS, DNS_TLD, TOKENS } from '@/config/contracts';
import { DNS_CONTROLLER_ABI, DNS_RESOLVER_ABI, ERC20_ABI } from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';
import DomainRequestForm from '@/components/dex/domains/DomainRequestForm';

type Info =
  | { state: 'loading' }
  | { state: 'available' }
  | { state: 'registered'; owner: string; expires: number }
  | { state: 'error'; message: string };

type Records = {
  addr: string;
  twitter: string;
  url: string;
  avatar: string;
  description: string;
};

type Holding = { symbol: string; logo: string; amount: string };

const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const fmtDate = (ts: number) =>
  ts
    ? new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
const daysUntil = (ts: number) => Math.ceil((ts * 1000 - Date.now()) / 86_400_000);

/** Deterministic gradient per name so every domain gets its own identity. */
const hueOf = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

export default function DomainDetailView({ name }: { name: string }) {
  const label = name.toLowerCase();
  const full = `${label}.${DNS_TLD}`;

  const [info, setInfo] = useState<Info>({ state: 'loading' });
  const [records, setRecords] = useState<Records | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setInfo({ state: 'loading' });
    try {
      const provider = getReadProvider();
      const controller = new ethers.Contract(CONTRACTS.DNS_CONTROLLER, DNS_CONTROLLER_ABI, provider);
      const detail = await controller.domainInfo(label).catch(() => null);

      let owner = ethers.constants.AddressZero;
      let expires = 0;
      let available = true;

      if (detail && Array.isArray(detail)) {
        owner = detail[0];
        expires = Number(detail[1] || 0);
        available = Boolean(detail[2]);
      } else {
        const flag = await controller.isAvailable(label).catch(() => true);
        available = Boolean(flag);
      }

      if (available || owner === ethers.constants.AddressZero) {
        setInfo({ state: 'available' });
        setRecords(null);
        setHoldings(null);
        return;
      }

      setInfo({ state: 'registered', owner, expires });

      const resolver = new ethers.Contract(CONTRACTS.DNS_RESOLVER, DNS_RESOLVER_ABI, provider);
      const [addr, twitter, url, avatar, description] = await Promise.all([
        resolver.getAddress(label, 'evm').catch(() => ''),
        resolver.getText(label, 'com.twitter').catch(() => ''),
        resolver.getText(label, 'url').catch(() => ''),
        resolver.getText(label, 'avatar').catch(() => ''),
        resolver.getText(label, 'description').catch(() => ''),
      ]);
      setRecords({ addr: addr || '', twitter: twitter || '', url: url || '', avatar: avatar || '', description: description || '' });

      // Associated assets: token balances held by the resolved (or owning) address.
      const target = ethers.utils.isAddress(addr || '') ? (addr as string) : owner;
      const list = TOKENS.filter(t => !t.isNative).slice(0, 8);
      const balances = await Promise.all(
        list.map(async t => {
          try {
            const erc = new ethers.Contract(t.address, ERC20_ABI, provider);
            const raw: ethers.BigNumber = await erc.balanceOf(target);
            if (raw.isZero()) return null;
            const amount = parseFloat(ethers.utils.formatUnits(raw, t.decimals));
            return { symbol: t.symbol, logo: t.logo, amount: amount.toLocaleString('en-US', { maximumFractionDigits: 4 }) };
          } catch {
            return null;
          }
        }),
      );
      setHoldings(balances.filter((b): b is Holding => !!b));
    } catch (err: any) {
      console.error('[DNS detail]', err);
      setInfo({ state: 'error', message: err?.shortMessage || err?.message || 'Failed to load domain' });
    }
  }, [label]);

  useEffect(() => { void load(); }, [load]);

  const copy = (value: string) => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 1500);
  };

  const shareUrl =
    typeof window !== 'undefined' ? window.location.href : `https://wolfdex.lovable.app/domain/${label}`;
  const hue = hueOf(label);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-8">
      <Link
        to="/domains"
        className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-wolf-pink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Name Service
      </Link>

      {/* Shareable preview card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mt-5 overflow-hidden rounded-3xl border border-wolf-border/40 p-6 sm:p-9"
        style={{
          background: `radial-gradient(120% 120% at 15% 10%, hsl(${hue} 70% 22% / 0.55), transparent 60%), linear-gradient(135deg, hsl(${(hue + 40) % 360} 60% 14% / 0.6), transparent)`,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl"
          style={{ background: `hsl(${hue} 80% 55% / 0.25)` }}
        />
        <div className="relative flex flex-wrap items-center gap-4">
          {records?.avatar ? (
            <img
              src={records.avatar}
              alt={`${full} avatar`}
              loading="lazy"
              className="h-16 w-16 rounded-2xl border border-wolf-border/40 object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div
              className="grid h-16 w-16 place-items-center rounded-2xl border border-wolf-border/40 text-xl font-black text-foreground"
              style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45% / 0.6), hsl(${(hue + 60) % 360} 70% 45% / 0.35))` }}
            >
              {label.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-black text-foreground sm:text-4xl">
              {label}
              <span className="wolf-gradient-text">.{DNS_TLD}</span>
            </h1>
            <p className="mt-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Globe className="h-3 w-3" /> {CHAIN_CONFIG.chainName} · ERC-721 name
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`${full} on WolfDex Name Service 🐺`)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-wolf-border/40 bg-background/50 px-3 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink"
            >
              <Twitter className="h-3.5 w-3.5" /> Share
            </a>
            <button
              onClick={() => copy(shareUrl)}
              className="inline-flex items-center gap-2 rounded-xl border border-wolf-border/40 bg-background/50 px-3 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />} Link
            </button>
          </div>
        </div>

        {/* Status */}
        <div className="relative mt-6">
          {info.state === 'loading' && (
            <div className="inline-flex items-center gap-2 rounded-xl border border-wolf-border/40 bg-background/50 px-3 py-2 text-xs font-bold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading on-chain state…
            </div>
          )}
          {info.state === 'error' && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
              {info.message}
            </div>
          )}
          {info.state === 'available' && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl border border-wolf-pink/40 bg-wolf-pink/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-wolf-pink">
                <Sparkles className="h-3.5 w-3.5" /> Available
              </span>
              <Link
                to="/domains"
                search={{ name: label } as never}
                className="wolf-btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"
              >
                <Search className="h-3.5 w-3.5" /> Claim {full}
              </Link>
            </div>
          )}
          {info.state === 'registered' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Status" value="Registered" icon={ShieldCheck} />
              <Stat label="Owner" value={short(info.owner)} icon={WalletIcon} onClick={() => copy(info.owner)} />
              <Stat
                label="Expires"
                value={`${fmtDate(info.expires)} · ${Math.max(0, daysUntil(info.expires))}d`}
                icon={Clock}
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Records */}
      {info.state === 'registered' && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-muted-foreground">
            On-chain records
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: 'EVM address', v: records?.addr || '—' },
              { k: 'Twitter', v: records?.twitter || '—' },
              { k: 'Website', v: records?.url || '—' },
              { k: 'Description', v: records?.description || '—' },
            ].map(r => (
              <div
                key={r.k}
                className="rounded-2xl border border-wolf-border/40 bg-wolf-surface/40 px-4 py-3"
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{r.k}</div>
                <div className="mt-1 truncate text-sm font-semibold text-foreground">{r.v}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Associated assets */}
      {info.state === 'registered' && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-muted-foreground">
            Associated tokens
          </h2>
          {holdings === null ? (
            <div className="rounded-2xl border border-wolf-border/40 bg-wolf-surface/40 px-4 py-6 text-center text-xs text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Scanning balances…
            </div>
          ) : holdings.length === 0 ? (
            <div className="rounded-2xl border border-wolf-border/40 bg-wolf-surface/40 px-4 py-6 text-center text-xs text-muted-foreground">
              No WolfDex token balances found for this name yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {holdings.map(h => (
                <div
                  key={h.symbol}
                  className="flex items-center gap-3 rounded-2xl border border-wolf-border/40 bg-wolf-surface/40 px-4 py-3"
                >
                  <img src={h.logo} alt={`${h.symbol} logo`} loading="lazy" className="h-8 w-8 rounded-full" />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-foreground">{h.symbol}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{h.amount}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/market" className="rounded-xl border border-wolf-border/40 bg-wolf-surface/50 px-3 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink">
              Explore Market
            </Link>
            <Link to="/pools" className="rounded-xl border border-wolf-border/40 bg-wolf-surface/50 px-3 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink">
              Browse Pools
            </Link>
            <a
              href={`${CHAIN_CONFIG.blockExplorer}/address/${CONTRACTS.DNS_BASE_REGISTRAR}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-wolf-border/40 bg-wolf-surface/50 px-3 py-2 text-xs font-bold text-foreground transition hover:border-wolf-pink/50 hover:text-wolf-pink"
            >
              Registry <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>
      )}

      <DomainRequestForm presetName={label} />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl border border-wolf-border/40 bg-background/50 px-4 py-3 text-left"
    >
      <Icon className="h-4 w-4 text-wolf-pink" />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-black text-foreground">{value}</div>
      </div>
      {onClick && <Copy className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
    </Wrapper>
  );
}
