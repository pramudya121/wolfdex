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
  | { state: 'available'; name: string; priceUsd: number }
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

  /* --- Real-time input sanitation ---------------------------------------- */
  const handleQueryChange = (raw: string) => {
    const clean = raw.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9-]/g, '');
    setQuery(clean);
    if (availability.state !== 'idle') setAvailability({ state: 'idle' });
  };

  const nameValid = query.length >= 3 && DOMAIN_REGEX.test(query);

  /* --- Load local primary preference ------------------------------------- */
  useEffect(() => {
    if (!address) return;
    try {
      const map = JSON.parse(localStorage.getItem(LOCAL_PRIMARY_KEY) || '{}');
      setPrimaryName(map[address.toLowerCase()] || '');
    } catch {
      /* ignore */
    }
  }, [address]);

  /* ---------------------------------------------------------------------- */
  /*  handleSearch — cek ketersediaan domain di on-chain controller         */
  /* ---------------------------------------------------------------------- */
  const handleSearch = useCallback(async () => {
    if (!nameValid) {
      toast.error('Enter a valid domain (min 3 chars, a-z, 0-9, -)');
      return;
    }
    setAvailability({ state: 'checking' });
    try {
      const provider = getReadProvider();
      const controller = new ethers.Contract(
        CONTRACTS.DNS_CONTROLLER,
        DNS_CONTROLLER_ABI,
        provider,
      );

      // === INTEGRASI KONTRAK (READ) =====================================
      // DomainRegistrarController.isAvailable(name)  → bool
      // DomainRegistrarController.domainInfo(name)   → (owner, expires, available)
      // Perhitungan harga pakai formula UI (USD_PER_YEAR) agar konsisten
      // untuk semua chain; kalau ingin harga on-chain pakai:
      //   controller.price(name, duration)  → uint256 (wei)
      // ==================================================================
      const [available, info] = await Promise.all([
        controller.isAvailable(query).catch(() => null),
        controller.domainInfo(query).catch(() => null),
      ]);

      const isAvail =
        typeof available === 'boolean'
          ? available
          : info
          ? Boolean(info[2])
          : true;

      if (isAvail) {
        setAvailability({
          state: 'available',
          name: query,
          priceUsd: USD_PER_YEAR(query.length),
        });
      } else {
        setAvailability({
          state: 'taken',
          name: query,
          owner: info?.[0] || ethers.constants.AddressZero,
          expires: info?.[1] ? Number(info[1]) : 0,
        });
      }
    } catch (err: any) {
      console.error('[DNS] isAvailable', err);
      toast.error(err?.shortMessage || err?.message || 'Failed to check availability');
      setAvailability({ state: 'idle' });
    }
  }, [nameValid, query]);

  /* ---------------------------------------------------------------------- */
  /*  handleMint — commit/reveal registration flow                          */
  /* ---------------------------------------------------------------------- */
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
      const controller = new ethers.Contract(
        CONTRACTS.DNS_CONTROLLER,
        DNS_CONTROLLER_ABI,
        wallet.signer,
      );

      // === INTEGRASI KONTRAK (WRITE) — Commit/Reveal =====================
      // 1) buat secret acak 32 byte (disimpan di memory, JANGAN kirim ke server)
      // 2) commitment = controller.makeCommitment(name, registrant, secret)
      // 3) controller.commit(commitment, name)  → tunggu COMMIT_REVEAL_DELAY
      // 4) controller.register(name, registrant, duration, secret, { value: price })
      //    price bisa diambil dari controller.price(name, duration).
      // ==================================================================
      const secret = ethers.utils.hexlify(ethers.utils.randomBytes(32));
      const commitment: string = await controller.makeCommitment(name, address, secret);
      const delay: ethers.BigNumber = await controller
        .COMMIT_REVEAL_DELAY()
        .catch(() => ethers.BigNumber.from(60));
      const priceWei: ethers.BigNumber = await controller
        .price(name, duration)
        .catch(() => ethers.utils.parseEther('0'));

      toast.loading('Step 1/2 — committing…', { id: 'mint' });
      const commitTx = await controller.commit(commitment, name);
      await commitTx.wait();

      const waitMs = Math.max(5_000, delay.toNumber() * 1000 + 3_000);
      toast.loading(`Waiting ${Math.ceil(waitMs / 1000)}s reveal window…`, { id: 'mint' });
      await new Promise(r => setTimeout(r, waitMs));

      toast.loading('Step 2/2 — registering…', { id: 'mint' });
      const regTx = await controller.register(name, address, duration, secret, {
        value: priceWei,
      });
      await regTx.wait();

      toast.success(`🎉 ${name}.${DNS_TLD} minted!`, { id: 'mint' });
      setAvailability({ state: 'idle' });
      setQuery('');
      loadOwned();
    } catch (err: any) {
      console.error('[DNS] mint', err);
      toast.error(err?.shortMessage || err?.message || 'Mint failed', { id: 'mint' });
    } finally {
      setMinting(false);
    }
  }, [availability, address, wallet.signer, years, setShowWalletModal]);

  /* ---------------------------------------------------------------------- */
  /*  loadOwned — read balance + tokenIds owned by user                     */
  /* ---------------------------------------------------------------------- */
  const loadOwned = useCallback(async () => {
    if (!address) {
      setOwned([]);
      return;
    }
    setLoadingOwned(true);
    try {
      const provider = getReadProvider();
      const registrar = new ethers.Contract(
        CONTRACTS.DNS_BASE_REGISTRAR,
        DNS_BASE_REGISTRAR_ABI,
        provider,
      );

      // === INTEGRASI KONTRAK (READ) =====================================
      // Cara paling akurat: index event Transfer(to == address) untuk
      // menemukan semua tokenId yang pernah diterima user, lalu filter
      // yang masih dimiliki via ownerOf. Untuk chain testnet volume rendah,
      // scan window blok terakhir sudah cukup.
      // ==================================================================
      const balance: ethers.BigNumber = await registrar.balanceOf(address).catch(() => ethers.BigNumber.from(0));
      const fromBlock = Math.max(0, (await provider.getBlockNumber()) - 200_000);
      const filter = registrar.filters.Transfer(null, address);
      const logs = await registrar.queryFilter(filter, fromBlock).catch(() => []);

      const ids = new Set<string>();
      for (const log of logs) {
        const tokenId = log.args?.tokenId?.toString();
        if (tokenId) ids.add(tokenId);
      }

      const results: OwnedDomain[] = [];
      const resolver = new ethers.Contract(
        CONTRACTS.DNS_RESOLVER,
        DNS_RESOLVER_ABI,
        provider,
      );
      const reverse: string = await resolver.getReverse(address).catch(() => '');

      for (const tokenId of ids) {
        try {
          const [owner, expires]: [string, ethers.BigNumber] = await Promise.all([
            registrar.ownerOf(tokenId),
            registrar.expiries(tokenId),
          ]);
          if (owner.toLowerCase() !== address.toLowerCase()) continue;
          // We can't easily reverse a tokenId → label without an off-chain
          // index. Fall back to the last 6 hex chars for display.
          const label = `0x${tokenId.slice(-8)}`;
          results.push({
            name: label,
            tokenId,
            expires: Number(expires),
            primary: reverse ? reverse.split('.')[0] === label : false,
          });
        } catch {
          /* skip */
        }
        if (results.length >= 24) break;
      }
      // Ensure balance sanity
      if (results.length === 0 && balance.gt(0)) {
        toast.message('Owned domains detected on-chain — indexing them may take a moment.');
      }
      setOwned(results);
    } catch (err) {
      console.error('[DNS] loadOwned', err);
    } finally {
      setLoadingOwned(false);
    }
  }, [address]);

  useEffect(() => {
    loadOwned();
  }, [loadOwned]);

  /* ---------------------------------------------------------------------- */
  /*  handleSetPrimary — set reverse record via resolver                    */
  /* ---------------------------------------------------------------------- */
  const handleSetPrimary = useCallback(
    async (name: string) => {
      if (!wallet.signer || !address) {
        setShowWalletModal(true);
        return;
      }
      try {
        // === INTEGRASI KONTRAK (WRITE) =================================
        // PublicResolver.setReverse(user, "namelengkap.dex")
        // Sesuaikan `full` dengan format nama on-chain kamu (mungkin butuh
        // TLD, mungkin tidak). Contract di atas simpan string apa adanya.
        // ================================================================
        const full = `${name}.${DNS_TLD}`;
        const resolver = new ethers.Contract(
          CONTRACTS.DNS_RESOLVER,
          DNS_RESOLVER_ABI,
          wallet.signer,
        );
        toast.loading(`Setting ${full} as primary…`, { id: 'primary' });
        const tx = await resolver.setReverse(address, full);
        await tx.wait();

        // Persist locally so UI updates instantly, even if resolver read
        // hasn't propagated yet.
        try {
          const map = JSON.parse(localStorage.getItem(LOCAL_PRIMARY_KEY) || '{}');
          map[address.toLowerCase()] = name;
          localStorage.setItem(LOCAL_PRIMARY_KEY, JSON.stringify(map));
        } catch {
          /* ignore */
        }
        setPrimaryName(name);
        setOwned(o => o.map(d => ({ ...d, primary: d.name === name })));
        toast.success(`${full} is now your primary domain`, { id: 'primary' });
      } catch (err: any) {
        console.error('[DNS] setPrimary', err);
        toast.error(err?.shortMessage || err?.message || 'Set primary failed', { id: 'primary' });
      }
    },
    [address, wallet.signer, setShowWalletModal],
  );

  const totalPrice = useMemo(() => {
    if (availability.state !== 'available') return 0;
    return availability.priceUsd * years;
  }, [availability, years]);

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                */
  /* ---------------------------------------------------------------------- */
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background pt-20 pb-24">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -top-40 left-1/2 h-[520px] w-[860px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, oklch(0.65 0.25 330 / 55%), transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 h-[380px] w-[520px] rounded-full opacity-30 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, oklch(0.7 0.2 45 / 45%), transparent 70%)',
          }}
        />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {/* -------- Internal header ---------------------------------------- */}
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-wolf-border/40 bg-wolf-surface/60">
              <Globe className="h-5 w-5 text-wolf-pink" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                DEX Name Service
              </h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                Claim your permanent Web3 identity — an NFT domain that replaces long wallet addresses.
              </p>
            </div>
          </motion.div>

          {/* Wallet status pill */}
          <div>
            {isConnected ? (
              <div className="flex items-center gap-2 rounded-full border border-wolf-border/40 bg-wolf-surface/70 px-3 py-2 text-xs">
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
                Hubungkan Dompet
              </button>
            )}
          </div>
        </header>

        {/* -------- Search area ------------------------------------------- */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="relative overflow-hidden rounded-3xl border border-wolf-border/40 bg-gradient-to-br from-wolf-surface/70 via-background to-wolf-surface/30 p-6 shadow-2xl sm:p-10"
        >
          <div className="mb-5 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.24em] text-wolf-pink">
            <Sparkles className="h-3.5 w-3.5" />
            Search & Verify
          </div>
          <h2 className="mx-auto max-w-2xl text-center text-2xl font-black leading-tight text-foreground sm:text-4xl">
            One name for all of Web3
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-muted-foreground">
            Search a domain, verify availability on-chain, then mint it as an NFT you truly own.
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
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Cek Ketersediaan
                </>
              )}
            </button>
          </div>

          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Only lowercase letters, digits and hyphens. Minimum 3 characters.
          </p>
        </motion.section>

        {/* -------- Result panel ------------------------------------------ */}
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
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-green-400">
                    <Check className="h-3 w-3" /> Tersedia
                  </span>
                  <h3 className="mt-3 text-3xl font-black text-foreground sm:text-4xl">
                    {availability.name}
                    <span className="text-wolf-pink">.{DNS_TLD}</span>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {availability.name.length}-character domain · ${availability.priceUsd}/year
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Registration length</span>
                  <div className="flex items-center gap-3 rounded-2xl border border-wolf-border/40 bg-wolf-surface/60 p-1.5">
                    <button
                      onClick={() => setYears(y => Math.max(1, y - 1))}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-background/60 text-foreground transition hover:bg-wolf-pink/20 disabled:opacity-40"
                      disabled={years <= 1}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-14 text-center">
                      <div className="text-xl font-black text-foreground">{years}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">year{years > 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={() => setYears(y => Math.min(5, y + 1))}
                      className="grid h-9 w-9 place-items-center rounded-xl bg-background/60 text-foreground transition hover:bg-wolf-pink/20 disabled:opacity-40"
                      disabled={years >= 5}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-wolf-border/30 pt-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
                  <div className="text-2xl font-black text-foreground">
                    ${totalPrice}
                    <span className="ml-2 text-sm font-medium text-muted-foreground">for {years}y</span>
                  </div>
                </div>

                <motion.button
                  onClick={handleMint}
                  disabled={minting}
                  whileHover={{ scale: minting ? 1 : 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="wolf-btn-primary relative flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-black disabled:opacity-70"
                >
                  {minting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Minting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Mint Domain
                    </>
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
                <X className="h-3 w-3" /> Sudah Dimiliki
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
                      onClick={() => {
                        navigator.clipboard.writeText(availability.owner);
                        toast.success('Address copied');
                      }}
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-wolf-surface hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`${CHAIN_CONFIG.blockExplorer}/address/${availability.owner}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md p-1 text-muted-foreground transition hover:bg-wolf-surface hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
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

        {/* -------- Owned domains ----------------------------------------- */}
        <section className="mt-14">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground sm:text-2xl">Domain Saya</h2>
              <p className="text-xs text-muted-foreground">
                NFT domains held by your wallet. Set one as primary to display it across WolfDex.
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
              >
                Hubungkan Dompet
              </button>
            </div>
          ) : loadingOwned ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 animate-pulse rounded-3xl border border-wolf-border/30 bg-wolf-surface/40"
                />
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
                    <div>
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
                    {domain.primary ? 'Primary Domain' : 'Jadikan Domain Utama'}
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
