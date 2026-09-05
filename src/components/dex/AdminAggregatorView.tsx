/**
 * AdminAggregatorView — owner-only control room for the DexAggregatorRouter.
 *
 * Tab 1 (Routers): whitelist/unwhitelist external DEX routers, update the
 * protocol fee + recipient, recover stuck tokens, inspect live config.
 * Tab 2 (Tokens): add any ERC-20, auto-read its on-chain metadata, upload a
 * logo from the device, and publish it as a VERIFIED token so it shows up in
 * every Select Token modal for everyone.
 *
 * Access: the page reads `owner()` on-chain and refuses to render the controls
 * for any other wallet. Verification writes are signed by the owner wallet and
 * re-checked server-side against `owner()`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import { useDexContext } from '@/context/DexContext';
import { CONTRACTS, type TokenInfo } from '@/config/contracts';
import { AGGREGATOR_ABI, ERC20_ABI } from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';
import { useAggregatorOwner } from '@/hooks/useAggregator';
import { useCustomTokens } from '@/hooks/useCustomTokens';
import { uploadTokenLogo, useLaunchpadRegistry } from '@/hooks/useLaunchpadRegistry';
import { registerVerifiedToken, buildVerifyMessage } from '@/lib/adminTokens.functions';
import { listAggregatorRouters, saveAggregatorRouter, buildRouterMessage } from '@/lib/adminRouters.functions';


interface RouterRow { address: string; label: string; whitelisted: boolean | null }

export default function AdminAggregatorView() {
  const { wallet } = useDexContext();
  const { signer, address, provider } = wallet;
  const { owner, isOwner, loading } = useAggregatorOwner(address);
  const [tab, setTab] = useState<'routers' | 'tokens'>('routers');

  return (
    <div className="max-w-5xl mx-auto px-4 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="wolf-card rounded-3xl p-6 mb-6 relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-16 w-64 h-64 rounded-full bg-wolf-pink/10 blur-3xl pointer-events-none" />
        <p className="text-[10px] uppercase tracking-[0.3em] text-wolf-pink mb-2">Owner console</p>
        <h1 className="text-2xl md:text-3xl font-bold">Aggregator &amp; Listing Admin</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Manage whitelisted DEX routers, protocol fees, and the verified token list used by every
          Select Token modal across WolfDex.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="px-2.5 py-1 rounded-lg bg-wolf-surface border border-wolf-border/30 font-mono">
            Aggregator: {CONTRACTS.AGGREGATOR.slice(0, 10)}…{CONTRACTS.AGGREGATOR.slice(-6)}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-wolf-surface border border-wolf-border/30 font-mono">
            Owner: {owner ? `${owner.slice(0, 10)}…${owner.slice(-6)}` : '—'}
          </span>
        </div>
      </motion.div>

      {loading ? (
        <div className="wolf-card rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Checking contract owner…
        </div>
      ) : !address ? (
        <Locked title="Connect your wallet" body="This page is only available to the contract owner." />
      ) : !isOwner ? (
        <Locked
          title="Access restricted"
          body="Your wallet is not the owner of the DexAggregatorRouter contract, so this console is hidden."
        />
      ) : (
        <>
          <div className="flex gap-2 mb-5">
            {(['routers', 'tokens'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  tab === t
                    ? 'bg-wolf-pink/15 border-wolf-pink/40 text-wolf-pink'
                    : 'bg-wolf-surface border-wolf-border/30 text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'routers' ? 'DEX Routers' : 'Token Listing'}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
            >
              {tab === 'routers' ? (
                <RoutersPanel signer={signer} provider={provider} />
              ) : (
                <TokensPanel signer={signer} address={address} provider={provider} />
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="wolf-card rounded-2xl p-10 text-center">
      <div className="text-3xl mb-3">🔒</div>
      <h2 className="text-lg font-bold mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
    </div>
  );
}

/* ------------------------------ Routers ------------------------------ */

function RoutersPanel({
  signer,
  provider,
}: {
  signer: ethers.Signer | null;
  provider: ethers.providers.Web3Provider | null;
}) {
  const read = useMemo(() => provider ?? getReadProvider(), [provider]);
  const readContract = useMemo(
    () => new ethers.Contract(CONTRACTS.AGGREGATOR, AGGREGATOR_ABI, read),
    [read],
  );
  const writeContract = useMemo(
    () => (signer ? new ethers.Contract(CONTRACTS.AGGREGATOR, AGGREGATOR_ABI, signer) : null),
    [signer],
  );

  const [rows, setRows] = useState<RouterRow[]>([]);
  const [newRouter, setNewRouter] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [feeBps, setFeeBps] = useState('');
  const [feeRecipient, setFeeRecipient] = useState('');
  const [liveFee, setLiveFee] = useState<{ bps: string; recipient: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [recoverToken, setRecoverToken] = useState('');
  const [recoverAmount, setRecoverAmount] = useState('');

  const loadStatuses = useCallback(
    async (list: RouterRow[]) => {
      const out = await Promise.all(
        list.map(async r => {
          try {
            const ok: boolean = await readContract.isWhitelistedRouter(r.address);
            return { ...r, whitelisted: ok };
          } catch {
            return { ...r, whitelisted: null };
          }
        }),
      );
      setRows(out);
    },
    [readContract],
  );

  useEffect(() => {
    (async () => {
      let stored: RouterRow[] = [];
      try {
        const remote = await listAggregatorRouters();
        stored = remote.map(r => ({ address: ethers.utils.getAddress(r.address), label: r.label, whitelisted: null }));
      } catch { /* offline — fall back to the canonical router only */ }
      const base: RouterRow[] = [{ address: CONTRACTS.ROUTER, label: 'WolfDex Router', whitelisted: null }];
      const merged = [...base, ...stored.filter(s => s.address.toLowerCase() !== CONTRACTS.ROUTER.toLowerCase())];
      setRows(merged);
      loadStatuses(merged);
    })();
  }, [loadStatuses]);

  useEffect(() => {
    (async () => {
      try {
        const [bps, recipient] = await Promise.all([
          readContract.feeBps(),
          readContract.feeRecipient(),
        ]);
        setLiveFee({ bps: bps.toString(), recipient });
        setFeeBps(bps.toString());
        setFeeRecipient(recipient);
      } catch { /* ignore */ }
    })();
  }, [readContract]);

  /** Persist a router entry to the shared database (owner-signed). */
  const persistRemote = async (address: string, label: string, remove = false) => {
    if (address.toLowerCase() === CONTRACTS.ROUTER.toLowerCase()) return;
    if (!signer) return;
    try {
      const timestamp = Date.now();
      const signature = await signer.signMessage(buildRouterMessage(address, timestamp));
      await saveAggregatorRouter({ data: { address, label, remove, timestamp, signature } });
    } catch (e: any) {
      toast.error('Could not sync router list', { description: e?.message || 'Please retry' });
    }
  };

  const run = async (key: string, fn: () => Promise<ethers.ContractTransaction>, ok: string) => {
    if (!writeContract) { toast.error('Connect the owner wallet'); return false; }
    setBusy(key);
    try {
      const tx = await fn();
      toast.info('Transaction sent', { description: tx.hash });
      await tx.wait();
      toast.success(ok);
      return true;
    } catch (e: any) {
      toast.error('Transaction failed', { description: e?.reason || e?.message || 'Reverted' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addRouter = async () => {
    const addr = newRouter.trim();
    if (!ethers.utils.isAddress(addr)) { toast.error('Invalid router address'); return; }
    const code = await read.getCode(addr);
    if (!code || code === '0x') { toast.error('No contract at that address'); return; }
    const ok = await run(
      'add',
      () => writeContract!.updateRouterWhitelist(ethers.utils.getAddress(addr), true),
      'Router whitelisted',
    );
    if (!ok) return;
    const label = newLabel.trim() || 'External Router';
    const checksummed = ethers.utils.getAddress(addr);
    setRows([
      ...rows.filter(r => r.address.toLowerCase() !== addr.toLowerCase()),
      { address: checksummed, label, whitelisted: true },
    ]);
    await persistRemote(checksummed, label);
    setNewRouter(''); setNewLabel('');
  };

  const toggleRouter = async (row: RouterRow) => {
    const next = !row.whitelisted;
    const ok = await run(
      `toggle-${row.address}`,
      () => writeContract!.updateRouterWhitelist(row.address, next),
      next ? 'Router whitelisted' : 'Router removed from whitelist',
    );
    if (!ok) return;
    setRows(rows.map(r => (r.address === row.address ? { ...r, whitelisted: next } : r)));
    await persistRemote(row.address, row.label, !next);
  };

  const saveFee = async () => {
    const bps = Number(feeBps);
    if (!Number.isInteger(bps) || bps < 0 || bps > 1000) { toast.error('Fee must be 0–1000 bps'); return; }
    if (!ethers.utils.isAddress(feeRecipient.trim())) { toast.error('Invalid fee recipient'); return; }
    const ok = await run(
      'fee',
      () => writeContract!.updateFeeConfiguration(bps, ethers.utils.getAddress(feeRecipient.trim())),
      'Fee configuration updated',
    );
    if (ok) setLiveFee({ bps: String(bps), recipient: feeRecipient.trim() });
  };

  const recover = async () => {
    const addr = recoverToken.trim();
    if (!ethers.utils.isAddress(addr)) { toast.error('Invalid token address'); return; }
    let decimals = 18;
    try {
      decimals = await new ethers.Contract(addr, ERC20_ABI, read).decimals();
    } catch { /* assume 18 */ }
    let amount: ethers.BigNumber;
    try {
      amount = ethers.utils.parseUnits(recoverAmount.trim() || '0', decimals);
    } catch { toast.error('Invalid amount'); return; }
    if (amount.isZero()) { toast.error('Amount must be greater than zero'); return; }
    const ok = await run('recover', () => writeContract!.recoverTokens(ethers.utils.getAddress(addr), amount), 'Tokens recovered');
    if (ok) { setRecoverToken(''); setRecoverAmount(''); }
  };

  return (
    <div className="space-y-5">
      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-1">Add a DEX router</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Whitelisted routers can be used by <span className="font-mono">executeSwap</span> for
          aggregated routing.
        </p>
        <div className="grid md:grid-cols-[1fr_180px_auto] gap-2">
          <input
            value={newRouter}
            onChange={e => setNewRouter(e.target.value)}
            placeholder="Router contract address (0x…)"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm font-mono"
          />
          <input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Label (optional)"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm"
          />
          <button
            onClick={addRouter}
            disabled={busy === 'add'}
            className="wolf-btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'add' ? 'Whitelisting…' : 'Whitelist'}
          </button>
        </div>
      </section>

      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-3">Routers</h2>
        <div className="space-y-2">
          {rows.map(r => (
            <div
              key={r.address}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-wolf-surface border border-wolf-border/30"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">{r.address}</div>
              </div>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  r.whitelisted
                    ? 'bg-wolf-gold/15 text-wolf-gold'
                    : 'bg-muted/30 text-muted-foreground'
                }`}
              >
                {r.whitelisted === null ? 'unknown' : r.whitelisted ? 'whitelisted' : 'disabled'}
              </span>
              <button
                onClick={() => toggleRouter(r)}
                disabled={busy === `toggle-${r.address}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-wolf-surface-hover border border-wolf-border/40 hover:border-wolf-pink/40 disabled:opacity-50"
              >
                {busy === `toggle-${r.address}` ? '…' : r.whitelisted ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No routers tracked yet.</p>
          )}
        </div>
      </section>

      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-1">Protocol fee</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Live: {liveFee ? `${liveFee.bps} bps → ${liveFee.recipient}` : 'loading…'}
        </p>
        <div className="grid md:grid-cols-[140px_1fr_auto] gap-2">
          <input
            value={feeBps}
            onChange={e => setFeeBps(e.target.value)}
            placeholder="Fee (bps)"
            inputMode="numeric"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm"
          />
          <input
            value={feeRecipient}
            onChange={e => setFeeRecipient(e.target.value)}
            placeholder="Fee recipient (0x…)"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm font-mono"
          />
          <button
            onClick={saveFee}
            disabled={busy === 'fee'}
            className="wolf-btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'fee' ? 'Saving…' : 'Update fee'}
          </button>
        </div>
      </section>

      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-1">Recover tokens</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Withdraw ERC-20 tokens accidentally sent to the aggregator.
        </p>
        <div className="grid md:grid-cols-[1fr_160px_auto] gap-2">
          <input
            value={recoverToken}
            onChange={e => setRecoverToken(e.target.value)}
            placeholder="Token address (0x…)"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm font-mono"
          />
          <input
            value={recoverAmount}
            onChange={e => setRecoverAmount(e.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            className="wolf-input px-4 py-2.5 rounded-xl text-sm"
          />
          <button
            onClick={recover}
            disabled={busy === 'recover'}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-wolf-surface border border-wolf-border/40 hover:border-wolf-pink/40 disabled:opacity-50"
          >
            {busy === 'recover' ? 'Recovering…' : 'Recover'}
          </button>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------ Tokens ------------------------------ */

function TokensPanel({
  signer,
  address,
  provider,
}: {
  signer: ethers.Signer | null;
  address: string;
  provider: ethers.providers.Web3Provider | null;
}) {
  const read = useMemo(() => provider ?? getReadProvider(), [provider]);
  const { addToken } = useCustomTokens();
  const { tokens, refresh } = useLaunchpadRegistry();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tokenAddr, setTokenAddr] = useState('');
  const [meta, setMeta] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [reading, setReading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const verified = tokens.filter(t => t.verified);

  useEffect(() => {
    const addr = tokenAddr.trim();
    setMeta(null);
    if (!ethers.utils.isAddress(addr)) return;
    let cancelled = false;
    setReading(true);
    (async () => {
      try {
        const c = new ethers.Contract(addr, ERC20_ABI, read);
        const [name, symbol, decimals] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
        if (!cancelled) setMeta({ name, symbol, decimals: Number(decimals) });
      } catch {
        if (!cancelled) toast.error('Could not read ERC-20 metadata at that address');
      } finally {
        if (!cancelled) setReading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tokenAddr, read]);

  const pickLogo = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
      toast.error('Use a PNG, JPG, GIF or WEBP image');
      return;
    }
    if (file.size > 512 * 1024) { toast.error('Logo too large (max 512 KB)'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    const addr = tokenAddr.trim();
    if (!ethers.utils.isAddress(addr) || !meta) { toast.error('Enter a valid ERC-20 address'); return; }
    if (!signer) { toast.error('Connect the owner wallet'); return; }
    setSaving(true);
    try {
      let logoUrl = '';
      if (logoFile) logoUrl = await uploadTokenLogo(logoFile, addr);

      const timestamp = Date.now();
      const signature = await signer.signMessage(buildVerifyMessage(addr, timestamp));

      await registerVerifiedToken({
        data: {
          address: ethers.utils.getAddress(addr),
          name: meta.name,
          symbol: meta.symbol,
          decimals: meta.decimals,
          logoUrl,
          timestamp,
          signature,
        },
      });

      const info: TokenInfo = {
        address: ethers.utils.getAddress(addr),
        name: meta.name,
        symbol: meta.symbol,
        decimals: meta.decimals,
        logo: logoUrl || '/images/wdex-logo.png',
      };
      addToken(info);
      await refresh();
      toast.success(`${meta.symbol} listed as verified`, {
        description: 'It now appears in every Select Token list.',
      });
      setTokenAddr(''); setMeta(null); setLogoFile(null); setLogoPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      toast.error('Listing failed', { description: e?.message || 'Please try again' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-1">List a verified token</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Metadata is read straight from the contract. The logo is uploaded from your device and
          published globally.
        </p>

        <input
          value={tokenAddr}
          onChange={e => setTokenAddr(e.target.value)}
          placeholder="Token contract address (0x…)"
          className="wolf-input w-full px-4 py-2.5 rounded-xl text-sm font-mono mb-3"
        />

        <AnimatePresence>
          {(reading || meta) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  ['Name', meta?.name],
                  ['Symbol', meta?.symbol],
                  ['Decimals', meta ? String(meta.decimals) : undefined],
                ].map(([label, value]) => (
                  <div key={label} className="px-3 py-2 rounded-xl bg-wolf-surface border border-wolf-border/30">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                    <div className="text-sm font-semibold truncate">{reading ? '…' : value || '—'}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); pickLogo(e.dataTransfer.files?.[0] ?? null); }}
          className="flex items-center gap-4 p-4 rounded-xl border border-dashed border-wolf-border/50 hover:border-wolf-pink/50 cursor-pointer transition-colors mb-4"
        >
          {logoPreview ? (
            <img src={logoPreview} alt="Logo preview" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-wolf-surface flex items-center justify-center text-lg">🖼️</div>
          )}
          <div className="text-xs">
            <div className="font-semibold">{logoFile ? logoFile.name : 'Upload token logo from device'}</div>
            <div className="text-muted-foreground">PNG, JPG, GIF or WEBP · max 512 KB</div>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={e => pickLogo(e.target.files?.[0] ?? null)}
        />

        <button
          onClick={submit}
          disabled={saving || !meta}
          className="wolf-btn-primary w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Publishing…' : 'Publish as verified token'}
        </button>
        <p className="text-[11px] text-muted-foreground mt-2">
          You will be asked to sign a message with {address.slice(0, 6)}…{address.slice(-4)} — it is
          verified server-side against the contract owner.
        </p>
      </section>

      <section className="wolf-card rounded-2xl p-5">
        <h2 className="font-bold mb-3">Verified tokens ({verified.length})</h2>
        <div className="space-y-2">
          {verified.map(t => (
            <div key={t.address} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-wolf-surface border border-wolf-border/30">
              <img
                src={t.logo_url || '/images/wdex-logo.png'}
                alt={t.symbol}
                className="w-8 h-8 rounded-full object-cover"
                onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{t.symbol}</div>
                <div className="text-[11px] text-muted-foreground truncate">{t.name}</div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-wolf-gold/15 text-wolf-gold uppercase tracking-wider">
                verified
              </span>
            </div>
          ))}
          {verified.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No verified tokens yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
