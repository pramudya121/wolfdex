import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Search,
  Globe,
  Wallet as WalletIcon,
  Check,
  X,
  Minus,
  Plus,
  Loader2,
  Star,
  Clock,
  Sparkles,
  Copy,
  ExternalLink,
  ShieldCheck,
  Flame,
  Zap,
  Crown,
  RefreshCw,
  Send,
  Activity,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { useDexContext } from '@/context/DexContext';
import { CONTRACTS, CHAIN_CONFIG, DNS_TLD } from '@/config/contracts';
import {
  DNS_CONTROLLER_ABI,
  DNS_BASE_REGISTRAR_ABI,
  DNS_RESOLVER_ABI,
} from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';

/* -------------------------------------------------------------------------- */
/*  Types & helpers                                                            */
/* -------------------------------------------------------------------------- */

type OwnedDomain = {
  name: string;
  tokenId: string;
  expires: number;
  primary: boolean;
};

type Availability =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; name: string; priceUsd: number; priceWei: ethers.BigNumber | null }
  | { state: 'taken'; name: string; owner: string; expires: number };

const USD_PER_YEAR = (len: number): number => {
  if (len <= 3) return 100;
  if (len === 4) return 50;
  return 5;
};

const DOMAIN_REGEX = /^[a-z0-9-]+$/;

const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const fmtDate = (ts: number) =>
  ts ? new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const LOCAL_PRIMARY_KEY = 'wolfdex.dns.primary';

// Namehash for reverse lookups / tokenId (label hash)
const labelHash = (name: string) =>
  ethers.utils.solidityKeccak256(['string'], [name.toLowerCase()]);

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DomainsView() {
  const { wallet, setShowWalletModal } = useDexContext();
  const address = wallet.address || '';
  const isConnected = !!address;

  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<Availability>({ state: 'idle' });
  const [years, setYears] = useState(1);
  const [minting, setMinting] = useState(false);
  const [owned, setOwned] = useState<OwnedDomain[]>([]);
  const [loadingOwned, setLoadingOwned] = useState(false);
  const [primaryName, setPrimaryName] = useState<string>('');
  const [gasEstimate, setGasEstimate] = useState<{
    gasWei: ethers.BigNumber;
    gasNative: string;
  } | null>(null);

  const handleQueryChange = (raw: string) => {
    const clean = raw.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '');
    setQuery(clean);
    if (availability.state !== 'idle') setAvailability({ state: 'idle' });
    setGasEstimate(null);
  };

  const nameValid = query.length >= 3 && DOMAIN_REGEX.test(query);

  useEffect(() => {
    if (!address) return;
    try {
      const map = JSON.parse(localStorage.getItem(LOCAL_PRIMARY_KEY) || '{}');
      setPrimaryName(map[address.toLowerCase()] || '');
    } catch { /* ignore */ }
  }, [address]);

  /* ------------------------------------------------------------------ */
  /*  handleSearch — on-chain availability via Controller + Registry    */
  /* ------------------------------------------------------------------ */
  const handleSearch = useCallback(async () => {
    if (!nameValid) {
      toast.error('Enter a valid name (min 3 chars, a-z, 0-9, -)');
      return;
    }
    setAvailability({ state: 'checking' });
    setGasEstimate(null);
    try {
      const provider = getReadProvider();
      const controller = new ethers.Contract(CONTRACTS.DNS_CONTROLLER, DNS_CONTROLLER_ABI, provider);
      const registrar = new ethers.Contract(CONTRACTS.DNS_BASE_REGISTRAR, DNS_BASE_REGISTRAR_ABI, provider);

      // Prefer explicit domainInfo (owner, expires, available); fall back to
      // isAvailable + registrar.expiries when the controller variant is older.
      const [info, availFlag, priceRes] = await Promise.all([
        controller.domainInfo(query).catch(() => null),
        controller.isAvailable(query).catch(() => null),
        controller.price(query, 365 * 24 * 60 * 60).catch(() => null),
      ]);

      let isAvail: boolean;
      let ownerAddr = ethers.constants.AddressZero;
      let expires = 0;

      if (info && Array.isArray(info)) {
        ownerAddr = info[0];
        expires = Number(info[1] || 0);
        isAvail = Boolean(info[2]);
      } else if (typeof availFlag === 'boolean') {
        isAvail = availFlag;
        if (!isAvail) {
          const tokenId = labelHash(query);
          const [o, e] = await Promise.all([
            registrar.ownerOf(tokenId).catch(() => ethers.constants.AddressZero),
            registrar.expiries(tokenId).catch(() => ethers.BigNumber.from(0)),
          ]);
          ownerAddr = o;
          expires = Number(e);
        }
      } else {
        isAvail = true;
      }

      if (isAvail) {
        setAvailability({
          state: 'available',
          name: query,
          priceUsd: USD_PER_YEAR(query.length),
          priceWei: priceRes ? ethers.BigNumber.from(priceRes) : null,
        });
      } else {
        setAvailability({ state: 'taken', name: query, owner: ownerAddr, expires });
      }
    } catch (err: any) {
      console.error('[DNS] search', err);
      toast.error(err?.shortMessage || err?.message || 'Failed to check availability');
      setAvailability({ state: 'idle' });
    }
  }, [nameValid, query]);

  /* ------------------------------------------------------------------ */
  /*  Gas estimate for mint (commit + register together)                */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (availability.state !== 'available' || !wallet.signer || !address) {
      setGasEstimate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const provider = getReadProvider();
        const controller = new ethers.Contract(CONTRACTS.DNS_CONTROLLER, DNS_CONTROLLER_ABI, provider);
        const gasPrice = await provider.getGasPrice();
        // Heuristic budget: commit (~60k) + register (~180k) = ~240k gas.
        const gasUnits = ethers.BigNumber.from(240_000);
        const totalWei = gasPrice.mul(gasUnits);
        if (!cancelled) {
          setGasEstimate({
            gasWei: totalWei,
            gasNative: parseFloat(ethers.utils.formatEther(totalWei)).toFixed(6),
          });
        }
        void controller; // referenced for future refinement
      } catch (err) {
        console.warn('[DNS] gas estimate', err);
      }
    })();
    return () => { cancelled = true; };
  }, [availability, wallet.signer, address, years]);

  /* ------------------------------------------------------------------ */
  /*  handleMint — commit / reveal / register                            */
  /* ------------------------------------------------------------------ */
  const handleMint = useCallback(async () => {
    if (availability.state !== 'available') return;
    if (!wallet.signer || !address) {
      setShowWalletModal(true);
      return;
    }
    setMinting(true);
    const name = availability.name;
    const duration = years * 365 * 24 * 60 * 60;

    try {
      const controller = new ethers.Contract(CONTRACTS.DNS_CONTROLLER, DNS_CONTROLLER_ABI, wallet.signer);

      const secret = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const commitment: string = await controller.makeCommitment(name, address, secret);
      const delay: ethers.BigNumber = await controller
        .COMMIT_REVEAL_DELAY()
        .catch(() => ethers.BigNumber.from(60));
      const priceWei: ethers.BigNumber = await controller
        .price(name, duration)
        .catch(() => ethers.BigNumber.from(0));

      toast.loading('Step 1/2 — committing to chain…', { id: 'mint' });
      const commitTx = await controller.commit(commitment, name);
      await commitTx.wait();

      const waitMs = Math.max(5_000, delay.toNumber() * 1000 + 3_000);
      toast.loading(`Waiting ${Math.ceil(waitMs / 1000)}s reveal window…`, { id: 'mint' });
      await new Promise(r => setTimeout(r, waitMs));

      toast.loading('Step 2/2 — registering domain…', { id: 'mint' });
      const regTx = await controller.register(name, address, duration, secret, { value: priceWei });
      await regTx.wait();

      toast.success(`🎉 ${name}.${DNS_TLD} is yours!`, { id: 'mint' });
      setAvailability({ state: 'idle' });
      setQuery('');
      loadOwned();
    } catch (err: any) {
      console.error('[DNS] mint', err);
      toast.error(err?.shortMessage || err?.message || 'Mint failed', { id: 'mint' });
    } finally {
      setMinting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, address, wallet.signer, years, setShowWalletModal]);

  /* ------------------------------------------------------------------ */
  /*  loadOwned — index via DomainRegistered event + verify ownership   */
  /* ------------------------------------------------------------------ */
  const loadOwned = useCallback(async () => {
    if (!address) { setOwned([]); return; }
    setLoadingOwned(true);
    try {
      const provider = getReadProvider();
      const controller = new ethers.Contract(CONTRACTS.DNS_CONTROLLER, DNS_CONTROLLER_ABI, provider);
      const registrar = new ethers.Contract(CONTRACTS.DNS_BASE_REGISTRAR, DNS_BASE_REGISTRAR_ABI, provider);
      const resolver = new ethers.Contract(CONTRACTS.DNS_RESOLVER, DNS_RESOLVER_ABI, provider);

      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 500_000);

      // Query DomainRegistered(name indexed, owner indexed, ...) — gives us the
      // human-readable name (via topic) plus the owner filter.
      const filter = controller.filters.DomainRegistered(null, address);
      const logs = await controller.queryFilter(filter, fromBlock).catch(() => [] as ethers.Event[]);

      const reverse: string = await resolver.getReverse(address).catch(() => '');
      const primaryLabel = reverse ? reverse.split('.')[0] : '';

      // Names come from event args (unindexed string). If a projector only
      // exposes the keccak, fall back to a hex snippet.
      const seen = new Map<string, OwnedDomain>();
      for (const log of logs) {
        try {
          const name: string =
            typeof log.args?.name === 'string' && log.args.name.length > 0
              ? log.args.name
              : '';
          if (!name) continue;
          const tokenId = labelHash(name);
          const [owner, expires] = await Promise.all([
            registrar.ownerOf(tokenId).catch(() => ethers.constants.AddressZero),
            registrar.expiries(tokenId).catch(() => ethers.BigNumber.from(0)),
          ]);
          if (owner.toLowerCase() !== address.toLowerCase()) continue;
          seen.set(tokenId, {
            name,
            tokenId,
            expires: Number(expires),
            primary: name === primaryLabel,
          });
        } catch { /* skip */ }
      }

      setOwned(Array.from(seen.values()).sort((a, b) => b.expires - a.expires));
    } catch (err) {
      console.error('[DNS] loadOwned', err);
    } finally {
      setLoadingOwned(false);
    }
  }, [address]);

  useEffect(() => { loadOwned(); }, [loadOwned]);

  /* ------------------------------------------------------------------ */
  /*  handleSetPrimary — reverse record + registry resolver             */
  /* ------------------------------------------------------------------ */
  const handleSetPrimary = useCallback(
    async (name: string) => {
      if (!wallet.signer || !address) {
        setShowWalletModal(true);
        return;
      }
      try {
        const full = `${name}.${DNS_TLD}`;
        const resolver = new ethers.Contract(CONTRACTS.DNS_RESOLVER, DNS_RESOLVER_ABI, wallet.signer);
        toast.loading(`Setting ${full} as primary…`, { id: 'primary' });
        const tx = await resolver.setReverse(address, full);
        await tx.wait();

        try {
          const map = JSON.parse(localStorage.getItem(LOCAL_PRIMARY_KEY) || '{}');
          map[address.toLowerCase()] = name;
          localStorage.setItem(LOCAL_PRIMARY_KEY, JSON.stringify(map));
        } catch { /* ignore */ }

        setPrimaryName(name);
        setOwned(o => o.map(d => ({ ...d, primary: d.name === name })));
        toast.success(`${full} is now your primary domain`, { id: 'primary' });
      } catch (err: any) {
        console.error('[DNS] setPrimary', err);
        toast.error(err?.shortMessage || err?.message || 'Failed to set primary', { id: 'primary' });
      }
    },
    [address, wallet.signer, setShowWalletModal],
  );

  const totalPrice = useMemo(() => {
    if (availability.state !== 'available') return 0;
    return availability.priceUsd * years;
  }, [availability, years]);

  const rarityBadge = useMemo(() => {
    if (availability.state !== 'available') return null;
    const len = availability.name.length;
    if (len <= 3) return { icon: Crown, label: 'Ultra Rare', accent: 'from-amber-400 to-rose-500' };
    if (len === 4) return { icon: Flame, label: 'Rare', accent: 'from-orange-400 to-pink-500' };
    return { icon: Sparkles, label: 'Standard', accent: 'from-fuchsia-400 to-purple-500' };
  }, [availability]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background pb-24">
      {/* Ambient background — luxury glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -top-56 left-1/2 h-[640px] w-[1020px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, oklch(0.65 0.28 330 / 55%), transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 right-0 h-[420px] w-[600px] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, oklch(0.75 0.22 55 / 45%), transparent 70%)' }}
        />
        <div
          className="absolute bottom-24 left-0 h-[380px] w-[520px] rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, oklch(0.7 0.22 280 / 45%), transparent 70%)' }}
        />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* Internal header */}
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4 pt-2">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="relative grid h-12 w-12 place-items-center rounded-2xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/80 to-background shadow-[0_0_40px_-10px_oklch(0.7_0.25_330_/_60%)]">
              <Globe className="h-6 w-6 text-wolf-pink" />
              <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-wolf-pink/10 to-transparent" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-wolf-pink">
                WolfDex Name Service
              </div>
              <h1 className="mt-0.5 text-xl font-black tracking-tight text-foreground sm:text-2xl">
                One name for all of Web3
              </h1>
            </div>
          </motion.div>

          <div>
            {isConnected ? (
              <div className="flex items-center gap-2 rounded-full border border-wolf-border/40 bg-wolf-surface/70 px-3 py-2 text-xs backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_10px_2px_oklch(0.75_0.2_150_/_60%)]" />
                {primaryName ? (
                  <span className="font-semibold text-wolf-pink">
                    {primaryName}.{DNS_TLD}
                  </span>
                ) : (
                  <span className="font-medium text-foreground">{short(address)}</span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                className="wolf-btn-primary flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold"
              >
                <WalletIcon className="h-3.5 w-3.5" />
                Connect Wallet
              </button>
            )}
          </div>
        </header>

        {/* Search hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/70 via-background to-wolf-surface/30 p-6 shadow-2xl sm:p-10"
        >
          {/* animated shimmer border accent */}
          <span
            className="pointer-events-none absolute inset-x-0 -top-px h-px"
            style={{ background: 'linear-gradient(90deg, transparent, oklch(0.75 0.25 330 / 80%), transparent)' }}
          />

          <div className="mb-5 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.24em] text-wolf-pink">
            <Sparkles className="h-3.5 w-3.5" />
            Search & Mint
          </div>
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-black leading-tight text-foreground sm:text-5xl">
            Your identity, <span className="wolf-gradient-text">on-chain forever</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
            Claim a permanent <span className="font-semibold text-wolf-pink">.{DNS_TLD}</span> domain NFT that replaces your long wallet address across every WolfDex surface.
          </p>

          <div className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <div className="group relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="yourname"
                spellCheck={false}
                autoComplete="off"
                className="h-14 w-full rounded-2xl border border-wolf-border/40 bg-background/70 pl-11 pr-24 text-base font-semibold text-foreground outline-none transition focus:border-wolf-pink/60 focus:ring-2 focus:ring-wolf-pink/30"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg border border-wolf-border/40 bg-wolf-surface/70 px-2.5 py-1 text-sm font-bold text-wolf-pink">
                .{DNS_TLD}
              </span>
            </div>
            <button
              onClick={handleSearch}
              disabled={!nameValid || availability.state === 'checking'}
              className="wolf-btn-primary flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {availability.state === 'checking' ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Checking…</>
              ) : (
                <><Search className="h-4 w-4" />Check Availability</>
              )}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Lowercase letters, digits and hyphens only. Minimum 3 characters.
          </p>
        </motion.section>

        {/* Result panels */}
        <AnimatePresence mode="wait">
          {availability.state === 'available' && (
            <motion.section
              key="avail"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 overflow-hidden rounded-3xl border border-green-500/30 bg-gradient-to-br from-green-500/10 via-background to-background p-6 shadow-xl sm:p-8"
            >
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-green-400">
                      <Check className="h-3 w-3" /> Available
                    </span>
                    {rarityBadge && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r ${rarityBadge.accent} px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg`}
                      >
                        <rarityBadge.icon className="h-3 w-3" /> {rarityBadge.label}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-3xl font-black text-foreground sm:text-4xl">
                    {availability.name}
                    <span className="text-wolf-pink">.{DNS_TLD}</span>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {availability.name.length}-character name · ${availability.priceUsd} / year
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Registration length</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-wolf-border/40 bg-wolf-surface/60 p-1.5">
                    <button
                      onClick={() => setYears(y => Math.max(1, y - 1))}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-background/60 text-foreground transition hover:bg-wolf-pink/20 disabled:opacity-40"
                      disabled={years <= 1}
                    ><Minus className="h-4 w-4" /></button>
                    <div className="w-14 text-center">
                      <div className="text-xl font-black text-foreground">{years}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">year{years > 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={() => setYears(y => Math.min(5, y + 1))}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-background/60 text-foreground transition hover:bg-wolf-pink/20 disabled:opacity-40"
                      disabled={years >= 5}
                    ><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>

              {/* Cost summary — price + gas fee */}
              <div className="mt-6 grid gap-3 rounded-2xl border border-wolf-border/30 bg-wolf-surface/40 p-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Registration</div>
                  <div className="mt-0.5 text-lg font-black text-foreground">${totalPrice}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {availability.priceWei
                      ? `${parseFloat(ethers.utils.formatEther(availability.priceWei.mul(years))).toFixed(4)} ${CHAIN_CONFIG.symbol}`
                      : `for ${years}y`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Zap className="h-3 w-3" /> Est. Gas Fee
                  </div>
                  <div className="mt-0.5 text-lg font-black text-foreground">
                    {gasEstimate ? `${gasEstimate.gasNative}` : isConnected ? '—' : 'Connect wallet'}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {gasEstimate ? CHAIN_CONFIG.symbol : 'commit + register'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total (approx.)</div>
                  <div className="mt-0.5 text-lg font-black wolf-gradient-text">
                    {availability.priceWei && gasEstimate
                      ? `${parseFloat(ethers.utils.formatEther(availability.priceWei.mul(years).add(gasEstimate.gasWei))).toFixed(4)} ${CHAIN_CONFIG.symbol}`
                      : `$${totalPrice}`}
                  </div>
                  <div className="text-[11px] text-muted-foreground">chain settled in one flow</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-4 border-t border-wolf-border/30 pt-6">
                <motion.button
                  onClick={handleMint}
                  disabled={minting}
                  whileHover={{ scale: minting ? 1 : 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="wolf-btn-primary relative flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black disabled:opacity-70"
                >
                  {minting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Minting…</>
                  ) : (
                    <><Sparkles className="h-4 w-4" />Mint Domain</>
                  )}
                </motion.button>
              </div>
            </motion.section>
          )}

          {availability.state === 'taken' && (
            <motion.section
              key="taken"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 overflow-hidden rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-500/10 via-background to-background p-6 shadow-xl sm:p-8"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-400">
                <X className="h-3 w-3" /> Already Registered
              </span>
              <h3 className="mt-3 text-3xl font-black text-foreground sm:text-4xl">
                {availability.name}
                <span className="text-wolf-pink">.{DNS_TLD}</span>
              </h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-wolf-border/30 bg-wolf-surface/40 p-4">
                  <div className="text-[11px] uppercase text-muted-foreground">Current owner</div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-sm text-foreground">
                    {short(availability.owner)}
                    <button
                      onClick={() => { navigator.clipboard.writeText(availability.owner); toast.success('Address copied'); }}
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-wolf-surface hover:text-foreground"
                    ><Copy className="h-3.5 w-3.5" /></button>
                    <a
                      href={`${CHAIN_CONFIG.blockExplorer}/address/${availability.owner}`}
                      target="_blank" rel="noreferrer"
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-wolf-surface hover:text-foreground"
                    ><ExternalLink className="h-3.5 w-3.5" /></a>
                  </div>
                </div>
                <div className="rounded-2xl border border-wolf-border/30 bg-wolf-surface/40 p-4">
                  <div className="text-[11px] uppercase text-muted-foreground">Expires</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-foreground">
                    <Clock className="h-3.5 w-3.5 text-wolf-gold" />
                    {fmtDate(availability.expires)}
                  </div>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Owned */}
        <section className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground sm:text-2xl">My Domains</h2>
              <p className="text-xs text-muted-foreground">
                NFT domains held by your wallet. Pin one as primary to display it everywhere on WolfDex.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-wolf-border/40 bg-wolf-surface/60 px-3 py-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-wolf-pink" />
              {owned.length} owned
            </div>
          </div>

          {!isConnected ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-wolf-border/40 bg-wolf-surface/30 py-14 text-center">
              <WalletIcon className="mb-3 h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">Connect your wallet</div>
              <div className="mt-1 text-xs text-muted-foreground">Sign in to see the domains you own.</div>
              <button
                onClick={() => setShowWalletModal(true)}
                className="wolf-btn-primary mt-4 rounded-full px-5 py-2 text-xs font-bold"
              >Connect Wallet</button>
            </div>
          ) : loadingOwned ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-3xl border border-wolf-border/30 bg-wolf-surface/40" />
              ))}
            </div>
          ) : owned.length === 0 ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-wolf-border/40 bg-wolf-surface/30 py-14 text-center">
              <Globe className="mb-3 h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-semibold text-foreground">No domains yet</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Search above and mint your first .{DNS_TLD} domain.
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {owned.map(domain => (
                <motion.article
                  key={domain.tokenId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -3 }}
                  className={`group relative overflow-hidden rounded-3xl border p-5 shadow-lg transition ${
                    domain.primary
                      ? 'border-wolf-pink/50 bg-gradient-to-br from-wolf-pink/15 via-background to-background'
                      : 'border-wolf-border/40 bg-wolf-surface/50'
                  }`}
                >
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-wolf-pink/10 blur-3xl transition group-hover:bg-wolf-pink/20" />
                  <div className="relative flex items-start justify-between">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Domain NFT</div>
                      <div className="mt-1 truncate text-xl font-black text-foreground">
                        {domain.name}
                        <span className="text-wolf-pink">.{DNS_TLD}</span>
                      </div>
                    </div>
                    {domain.primary && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-wolf-pink/40 bg-wolf-pink/20 px-2 py-0.5 text-[10px] font-bold uppercase text-wolf-pink">
                        <Star className="h-3 w-3" /> Primary
                      </span>
                    )}
                  </div>

                  <div className="relative mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-wolf-gold" />
                    Expires {fmtDate(domain.expires)}
                  </div>

                  <button
                    onClick={() => handleSetPrimary(domain.name)}
                    disabled={domain.primary}
                    className={`relative mt-5 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                      domain.primary
                        ? 'cursor-default border-wolf-pink/30 bg-wolf-pink/10 text-wolf-pink/80'
                        : 'border-wolf-border/40 bg-background/60 text-foreground hover:border-wolf-pink/50 hover:bg-wolf-pink/10'
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" />
                    {domain.primary ? 'Primary Domain' : 'Set as Primary'}
                  </button>
                </motion.article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
