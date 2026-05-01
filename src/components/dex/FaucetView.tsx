import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CONTRACTS, FAUCET_TOKENS, getTokenByAddress, getTokenBySymbol, type TokenInfo } from '@/config/contracts';
import { FAUCET_ABI, ERC20_ABI } from '@/config/abis';
import { useDexContext } from '@/context/DexContext';
import BorderBeam from './ui/BorderBeam';

interface FaucetSlot {
  index: number;
  token: TokenInfo | undefined;
  expectedToken: TokenInfo | undefined;
  tokenAddress: string;
  claimAmount: string;        // formatted
  claimAmountRaw: ethers.BigNumber;
  maxClaims: number;
  userClaims: number;
  lastClaimed: number;        // unix seconds
  faucetBalance: string;      // formatted
  decimals: number;
  isConfigured: boolean;
  configWarning?: string;
}

function fmtSecs(s: number) {
  if (s <= 0) return 'ready';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function FaucetView() {
  const { wallet } = useDexContext();
  const { signer, address, isConnected, provider } = wallet;

  const [tab, setTab] = useState<'claim' | 'admin'>('claim');
  const [slots, setSlots] = useState<FaucetSlot[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const [owner, setOwner] = useState<string>('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();

  // 1s ticker for cooldown countdowns
  useEffect(() => {
    const i = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(i);
  }, []);

  const readProvider = useMemo(() => {
    if (provider) return provider;
    return new ethers.providers.JsonRpcProvider('https://liteforge.rpc.caldera.xyz/http');
  }, [provider]);

  const faucetRead = useMemo(
    () => new ethers.Contract(CONTRACTS.FAUCET, FAUCET_ABI, readProvider),
    [readProvider],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ownerAddr, cd] = await Promise.all([
        faucetRead.owner(),
        faucetRead.cooldown(),
      ]);
      setOwner(ownerAddr);
      setCooldown(cd.toNumber());

      const userAddr = address ?? ethers.constants.AddressZero;
      const next: FaucetSlot[] = await Promise.all(
        FAUCET_TOKENS.map(async ({ index, symbol }) => {
          const expectedToken = getTokenBySymbol(symbol);
          let token = expectedToken;
          let tokenAddress = ethers.constants.AddressZero;
          let decimals = expectedToken?.decimals ?? 18;
          let claimRaw = ethers.BigNumber.from(0);
          let maxC = 0;
          let userC = 0;
          let last = 0;
          let bal = '0';
          let isConfigured = false;
          let configWarning = '';
          try {
            const [tAddr, amt, mx, uc, lc] = await Promise.all([
              faucetRead.tokens(index).catch(() => ethers.constants.AddressZero),
              faucetRead.claimAmounts(index).catch(() => ethers.BigNumber.from(0)),
              faucetRead.maxClaims(index).catch(() => ethers.BigNumber.from(0)),
              userAddr === ethers.constants.AddressZero
                ? Promise.resolve(ethers.BigNumber.from(0))
                : faucetRead.userClaimCount(userAddr, index).catch(() => ethers.BigNumber.from(0)),
              userAddr === ethers.constants.AddressZero
                ? Promise.resolve(ethers.BigNumber.from(0))
                : faucetRead.lastClaimed(userAddr, index).catch(() => ethers.BigNumber.from(0)),
            ]);
            if (tAddr && tAddr !== ethers.constants.AddressZero) {
              tokenAddress = tAddr;
              isConfigured = true;
            }
            claimRaw = amt;
            maxC = mx.toNumber();
            userC = uc.toNumber();
            last = lc.toNumber();
            if (isConfigured) {
              try {
                const erc = new ethers.Contract(tokenAddress, ERC20_ABI, readProvider);
                const [d, b] = await Promise.all([
                  erc.decimals().catch(() => decimals),
                  erc.balanceOf(CONTRACTS.FAUCET).catch(() => ethers.BigNumber.from(0)),
                ]);
                decimals = typeof d === 'number' ? d : decimals;
                bal = ethers.utils.formatUnits(b, decimals);
                token = getTokenByAddress(tokenAddress) || expectedToken;
              } catch { /* ignore */ }
            } else if (amt.gt(0) || mx.gt(0)) {
              configWarning = 'Token address belum di-set di contract';
            }
          } catch { /* ignore */ }
          return {
            index, token, expectedToken, tokenAddress,
            claimAmount: isConfigured ? ethers.utils.formatUnits(claimRaw, decimals) : '0',
            claimAmountRaw: isConfigured ? claimRaw : ethers.BigNumber.from(0),
            maxClaims: maxC, userClaims: userC, lastClaimed: last,
            faucetBalance: bal, decimals, isConfigured, configWarning,
          };
        }),
      );
      setSlots(next);
    } catch (e: any) {
      console.error('[Faucet] load error', e);
      toast.error(e?.message || 'Failed to load faucet');
    } finally { setLoading(false); }
  }, [faucetRead, readProvider, address]);

  useEffect(() => { load(); }, [load]);

  const requireSigner = useCallback(() => {
    if (!isConnected || !signer) {
      toast.error('Connect your wallet first');
      return null;
    }
    return new ethers.Contract(CONTRACTS.FAUCET, FAUCET_ABI, signer);
  }, [isConnected, signer]);

  const claimOne = useCallback(async (slot: FaucetSlot) => {
    const c = requireSigner(); if (!c) return;
    setBusy(`claim-${slot.index}`);
    try {
      const tx = await c.claim(slot.index);
      toast.info('Claim submitted…');
      await tx.wait();
      toast.success(`Claimed ${parseFloat(slot.claimAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${slot.token?.symbol || `#${slot.index}`}`);
      load();
    } catch (e: any) {
      toast.error(e?.reason || e?.data?.message || e?.message || 'Claim failed');
    } finally { setBusy(null); }
  }, [requireSigner, load]);

  const claimAll = useCallback(async () => {
    const c = requireSigner(); if (!c) return;
    setBusy('claim-all');
    try {
      const tx = await c.claimAll();
      toast.info('Claim-all submitted…');
      await tx.wait();
      toast.success('Claimed all available tokens');
      load();
    } catch (e: any) {
      toast.error(e?.reason || e?.data?.message || e?.message || 'Claim-all failed');
    } finally { setBusy(null); }
  }, [requireSigner, load]);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-1">💧 Token Faucet</h1>
        <p className="text-muted-foreground text-sm">Claim free test tokens to use across WolfDex on LitVM LiteForge.</p>
      </div>

      {/* Tabs */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-wolf-surface/60 border border-wolf-border/40 rounded-xl p-1">
          <button
            onClick={() => setTab('claim')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'claim' ? 'bg-wolf-red/20 text-foreground border border-wolf-red/40' : 'text-muted-foreground'}`}
          >Claim</button>
          {isOwner && (
            <button
              onClick={() => setTab('admin')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab === 'admin' ? 'bg-wolf-gold/20 text-foreground border border-wolf-gold/40' : 'text-muted-foreground'}`}
            >⚙️ Admin</button>
          )}
        </div>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <BorderBeam rounded="rounded-xl">
          <div className="wolf-stat-card rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cooldown</div>
            <div className="text-lg font-bold mt-0.5">{fmtSecs(cooldown)}</div>
          </div>
        </BorderBeam>
        <BorderBeam rounded="rounded-xl">
          <div className="wolf-stat-card rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tokens</div>
            <div className="text-lg font-bold mt-0.5">{slots.length}</div>
          </div>
        </BorderBeam>
        <BorderBeam rounded="rounded-xl">
          <div className="wolf-stat-card rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Owner</div>
            <div className="text-[11px] font-mono mt-1 truncate">{owner ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : '—'}</div>
          </div>
        </BorderBeam>
        <BorderBeam rounded="rounded-xl">
          <div className="wolf-stat-card rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">You</div>
            <div className="text-[11px] font-mono mt-1 truncate">{address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Not connected'}</div>
          </div>
        </BorderBeam>
      </div>

      {tab === 'claim' && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Available Tokens</h2>
            <div className="flex items-center gap-2">
              <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground">🔄 Refresh</button>
              <button
                onClick={claimAll}
                disabled={!isConnected || busy === 'claim-all'}
                className="wolf-btn-primary px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
              >{busy === 'claim-all' ? 'Claiming…' : '💧 Claim All'}</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {slots.map(slot => {
              const nextAt = slot.lastClaimed + cooldown;
              const remaining = Math.max(0, nextAt - now);
              const ready = remaining === 0;
              const reachedMax = slot.maxClaims > 0 && slot.userClaims >= slot.maxClaims;
              const empty = !slot.claimAmountRaw.gt(0);
              const disabled = !isConnected || !!busy || !ready || reachedMax || empty;
              const reason = !isConnected
                ? 'Connect wallet'
                : empty
                ? 'Not configured'
                : reachedMax
                ? 'Max reached'
                : !ready
                ? `Wait ${fmtSecs(remaining)}`
                : 'Claim';
              const sym = slot.token?.symbol || `Slot #${slot.index}`;
              const logo = slot.token?.logo || '/images/wdex-logo.png';
              return (
                <motion.div
                  key={slot.index}
                  whileHover={{ y: -3 }}
                  className="wolf-card rounded-xl p-4 flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img src={logo} alt={sym} className="w-10 h-10 rounded-full ring-2 ring-wolf-pink/20"
                         onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{sym}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{slot.token?.name || 'Unknown'}</div>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-wolf-surface/60 border border-wolf-border/30 text-muted-foreground">#{slot.index}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
                    <div className="rounded-md bg-wolf-surface/50 border border-wolf-border/20 p-2">
                      <div className="text-muted-foreground uppercase tracking-wider">Per Claim</div>
                      <div className="font-bold text-sm text-wolf-gold">{parseFloat(slot.claimAmount).toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                    </div>
                    <div className="rounded-md bg-wolf-surface/50 border border-wolf-border/20 p-2">
                      <div className="text-muted-foreground uppercase tracking-wider">Pool</div>
                      <div className="font-bold text-sm">{parseFloat(slot.faucetBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                    </div>
                    <div className="rounded-md bg-wolf-surface/50 border border-wolf-border/20 p-2">
                      <div className="text-muted-foreground uppercase tracking-wider">You</div>
                      <div className="font-bold text-sm">{slot.userClaims}{slot.maxClaims > 0 ? `/${slot.maxClaims}` : ''}</div>
                    </div>
                    <div className="rounded-md bg-wolf-surface/50 border border-wolf-border/20 p-2">
                      <div className="text-muted-foreground uppercase tracking-wider">Next</div>
                      <div className={`font-bold text-sm ${ready ? 'text-wolf-green' : 'text-wolf-gold'}`}>{fmtSecs(remaining)}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => claimOne(slot)}
                    disabled={disabled}
                    className="mt-auto wolf-btn-primary w-full px-3 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <img src={logo} alt="" className="w-5 h-5 rounded-full"
                         onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    {busy === `claim-${slot.index}` ? 'Claiming…' : reason === 'Claim' ? `Claim ${sym}` : reason}
                  </button>
                </motion.div>
              );
            })}
            {loading && slots.length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-12">Loading faucet…</div>
            )}
          </div>
        </div>
      )}

      {tab === 'admin' && isOwner && (
        <AdminPanel slots={slots} cooldown={cooldown} reload={load} />
      )}
    </motion.div>
  );
}

// ===================== Admin =====================
function AdminPanel({ slots, cooldown, reload }: { slots: FaucetSlot[]; cooldown: number; reload: () => void }) {
  const { wallet } = useDexContext();
  const { signer, address, provider } = wallet;
  const [busy, setBusy] = useState<string | null>(null);
  const [newCooldown, setNewCooldown] = useState(String(cooldown));
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [maxes, setMaxes] = useState<Record<number, string>>({});
  const [tokenAddrs, setTokenAddrs] = useState<Record<number, string>>({});
  const [refills, setRefills] = useState<Record<number, string>>({});
  const [withdraws, setWithdraws] = useState<Record<number, { amount: string; to: string }>>({});
  const [resetUsers, setResetUsers] = useState<Record<number, string>>({});
  const [walletBals, setWalletBals] = useState<Record<number, string>>({});

  // Load user wallet balance for each token (so admin can see what they actually own)
  useEffect(() => {
    if (!address || !provider) return;
    let cancelled = false;
    (async () => {
      const out: Record<number, string> = {};
      await Promise.all(slots.map(async s => {
        if (!s.tokenAddress || s.tokenAddress === ethers.constants.AddressZero) {
          out[s.index] = '0'; return;
        }
        try {
          const erc = new ethers.Contract(s.tokenAddress, ERC20_ABI, provider);
          const b = await erc.balanceOf(address);
          out[s.index] = ethers.utils.formatUnits(b, s.decimals);
        } catch { out[s.index] = '0'; }
      }));
      if (!cancelled) setWalletBals(out);
    })();
    return () => { cancelled = true; };
  }, [slots, address, provider]);

  useEffect(() => { setNewCooldown(String(cooldown)); }, [cooldown]);
  useEffect(() => {
    const a: Record<number, string> = {};
    const m: Record<number, string> = {};
    const t: Record<number, string> = {};
    slots.forEach(s => {
      a[s.index] = s.claimAmount;
      m[s.index] = String(s.maxClaims);
      t[s.index] = s.tokenAddress;
    });
    setAmounts(a); setMaxes(m); setTokenAddrs(t);
  }, [slots]);

  const faucet = useMemo(
    () => signer ? new ethers.Contract(CONTRACTS.FAUCET, FAUCET_ABI, signer) : null,
    [signer],
  );

  const run = useCallback(async (key: string, fn: () => Promise<ethers.ContractTransaction>, ok: string) => {
    if (!faucet) { toast.error('Connect wallet'); return; }
    setBusy(key);
    try {
      const tx = await fn();
      toast.info('Submitted…');
      await tx.wait();
      toast.success(ok);
      reload();
    } catch (e: any) {
      toast.error(e?.reason || e?.data?.message || e?.message || 'Tx failed');
    } finally { setBusy(null); }
  }, [faucet, reload]);

  const setCd = () => {
    const v = parseInt(newCooldown);
    if (!Number.isFinite(v) || v < 0) return toast.error('Invalid seconds');
    run('cd', () => faucet!.setCooldown(v), `Cooldown set to ${v}s`);
  };

  const refill = async (s: FaucetSlot) => {
    if (!signer || !faucet || !address) { toast.error('Connect wallet'); return; }
    const v = refills[s.index];
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0) return toast.error('Invalid amount');
    if (!s.tokenAddress || s.tokenAddress === ethers.constants.AddressZero) {
      return toast.error(`Slot #${s.index} has no token configured. Set a token address first.`);
    }
    let raw: ethers.BigNumber;
    try { raw = ethers.utils.parseUnits(v, s.decimals); }
    catch { return toast.error('Invalid amount format'); }

    setBusy(`refill-${s.index}`);
    try {
      const erc = new ethers.Contract(s.tokenAddress, ERC20_ABI, signer);

      // Pre-flight: check wallet balance
      const myBal: ethers.BigNumber = await erc.balanceOf(address);
      if (myBal.lt(raw)) {
        const have = ethers.utils.formatUnits(myBal, s.decimals);
        toast.error(`Insufficient balance. You have ${parseFloat(have).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${s.token?.symbol || ''}, need ${v}.`);
        setBusy(null); return;
      }

      // Approve (handle USDT-style: must reset to 0 first if non-zero allowance)
      const allowance: ethers.BigNumber = await erc.allowance(address, CONTRACTS.FAUCET);
      if (allowance.lt(raw)) {
        if (allowance.gt(0)) {
          try {
            toast.info('Resetting allowance…');
            const z = await erc.approve(CONTRACTS.FAUCET, 0);
            await z.wait();
          } catch { /* some tokens allow direct increase, continue */ }
        }
        toast.info('Approving token…');
        const a = await erc.approve(CONTRACTS.FAUCET, raw);
        await a.wait();
      }

      // Pre-flight estimateGas with explicit reason surfacing
      try {
        await faucet.estimateGas.refill(s.index, raw);
      } catch (estErr: any) {
        const reason = estErr?.error?.data?.message || estErr?.data?.message || estErr?.reason || estErr?.message || 'Pre-flight failed';
        toast.error(`Refill would revert: ${reason}`);
        setBusy(null); return;
      }

      toast.info('Refilling…');
      const tx = await faucet.refill(s.index, raw);
      await tx.wait();
      toast.success(`Refilled ${v} ${s.token?.symbol || `#${s.index}`}`);
      setRefills(r => ({ ...r, [s.index]: '' }));
      reload();
    } catch (e: any) {
      toast.error(e?.reason || e?.data?.message || e?.message || 'Refill failed');
    } finally { setBusy(null); }
  };

  const adminWithdraw = async (s: FaucetSlot) => {
    if (!faucet) { toast.error('Connect wallet'); return; }
    const cfg = withdraws[s.index] || { amount: '', to: '' };
    const n = parseFloat(cfg.amount);
    if (!Number.isFinite(n) || n <= 0) return toast.error('Invalid amount');
    if (!ethers.utils.isAddress(cfg.to)) return toast.error('Invalid recipient');
    let raw: ethers.BigNumber;
    try { raw = ethers.utils.parseUnits(cfg.amount, s.decimals); }
    catch { return toast.error('Invalid amount'); }
    run(`wd-${s.index}`, () => faucet.adminWithdraw(s.index, raw, cfg.to), `Withdrew ${cfg.amount} ${s.token?.symbol || `#${s.index}`}`);
  };

  const resetUserCount = (s: FaucetSlot) => {
    if (!faucet) { toast.error('Connect wallet'); return; }
    const u = resetUsers[s.index];
    if (!u || !ethers.utils.isAddress(u)) return toast.error('Invalid user address');
    run(`ru-${s.index}`, () => faucet.setUserClaimCount(u, s.index, 0), `Reset claim count for ${u.slice(0, 6)}…${u.slice(-4)}`);
  };

  return (
    <div className="space-y-5">
      <div className="wolf-card rounded-xl p-4">
        <h3 className="font-bold text-sm mb-3 flex items-center gap-2">⏱️ Global Cooldown</h3>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} value={newCooldown}
            onChange={e => setNewCooldown(e.target.value)}
            className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-lg px-3 py-2 text-sm font-mono"
            placeholder="Seconds"
          />
          <button onClick={setCd} disabled={busy === 'cd'}
            className="wolf-btn-primary px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50">
            {busy === 'cd' ? '…' : 'Set'}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Time users must wait between claims of the same token.</p>
      </div>

      <div>
        <h3 className="font-bold text-sm mb-3 text-muted-foreground uppercase tracking-wider">Per-Token Settings</h3>
        <div className="space-y-3">
          {slots.map(s => {
            const sym = s.token?.symbol || `#${s.index}`;
            const logo = s.token?.logo || '/images/wdex-logo.png';
            return (
              <div key={s.index} className="wolf-card rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <img src={logo} alt={sym} className="w-8 h-8 rounded-full"
                       onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                  <div className="flex-1">
                    <div className="font-bold text-sm">{sym} <span className="text-[10px] text-muted-foreground">slot #{s.index}</span></div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{s.tokenAddress}</div>
                  </div>
                  <div className="text-right text-[10px]">
                    <div className="text-muted-foreground">Pool</div>
                    <div className="font-bold">{parseFloat(s.faucetBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* setToken */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Token Address</label>
                    <div className="flex gap-2 mt-1">
                      <input value={tokenAddrs[s.index] || ''} onChange={e => setTokenAddrs(t => ({ ...t, [s.index]: e.target.value }))}
                        className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder="0x…" />
                      <button
                        onClick={() => run(`tk-${s.index}`, () => faucet!.setToken(s.index, tokenAddrs[s.index]), `Token #${s.index} updated`)}
                        disabled={busy === `tk-${s.index}`}
                        className="px-2 py-1.5 rounded-md bg-wolf-pink/20 border border-wolf-pink/40 text-[11px] font-bold hover:bg-wolf-pink/30 disabled:opacity-50">
                        {busy === `tk-${s.index}` ? '…' : 'Set'}
                      </button>
                    </div>
                  </div>

                  {/* setClaimAmount */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Claim Amount (per claim)</label>
                    <div className="flex gap-2 mt-1">
                      <input value={amounts[s.index] || ''} onChange={e => setAmounts(a => ({ ...a, [s.index]: e.target.value }))}
                        className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder="e.g. 100" />
                      <button
                        onClick={() => {
                          const v = amounts[s.index];
                          try {
                            const raw = ethers.utils.parseUnits(v || '0', s.decimals);
                            run(`amt-${s.index}`, () => faucet!.setClaimAmount(s.index, raw), `Amount updated for ${sym}`);
                          } catch { toast.error('Invalid amount'); }
                        }}
                        disabled={busy === `amt-${s.index}`}
                        className="px-2 py-1.5 rounded-md bg-wolf-gold/20 border border-wolf-gold/40 text-[11px] font-bold hover:bg-wolf-gold/30 disabled:opacity-50">
                        {busy === `amt-${s.index}` ? '…' : 'Set'}
                      </button>
                    </div>
                  </div>

                  {/* setMaxClaims */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Claims per User (0 = unlimited)</label>
                    <div className="flex gap-2 mt-1">
                      <input type="number" min={0} value={maxes[s.index] || ''} onChange={e => setMaxes(m => ({ ...m, [s.index]: e.target.value }))}
                        className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" />
                      <button
                        onClick={() => {
                          const n = parseInt(maxes[s.index] || '0');
                          if (!Number.isFinite(n) || n < 0) return toast.error('Invalid max');
                          run(`mx-${s.index}`, () => faucet!.setMaxClaims(s.index, n), `Max claims set for ${sym}`);
                        }}
                        disabled={busy === `mx-${s.index}`}
                        className="px-2 py-1.5 rounded-md bg-wolf-pink/20 border border-wolf-pink/40 text-[11px] font-bold hover:bg-wolf-pink/30 disabled:opacity-50">
                        {busy === `mx-${s.index}` ? '…' : 'Set'}
                      </button>
                    </div>
                  </div>

                  {/* refill */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Deposit Liquidity</label>
                      <span className="text-[10px] text-muted-foreground">
                        Wallet: <span className="font-mono text-foreground">{parseFloat(walletBals[s.index] || '0').toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      </span>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <input value={refills[s.index] || ''} onChange={e => setRefills(r => ({ ...r, [s.index]: e.target.value }))}
                        className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder={`Amount in ${sym}`} />
                      <button
                        onClick={() => setRefills(r => ({ ...r, [s.index]: walletBals[s.index] || '0' }))}
                        className="px-2 py-1.5 rounded-md bg-wolf-surface border border-wolf-border/40 text-[10px] font-bold hover:bg-wolf-border/40">
                        Max
                      </button>
                      <button onClick={() => refill(s)} disabled={busy === `refill-${s.index}`}
                        className="px-2 py-1.5 rounded-md bg-wolf-green/20 border border-wolf-green/40 text-[11px] font-bold text-wolf-green hover:bg-wolf-green/30 disabled:opacity-50">
                        {busy === `refill-${s.index}` ? '…' : 'Refill'}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Auto-checks balance, approves &amp; transfers tokens into the faucet pool.</p>
                  </div>

                  {/* adminWithdraw */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin Withdraw</label>
                    <div className="grid grid-cols-1 gap-2 mt-1">
                      <input
                        value={withdraws[s.index]?.to || ''}
                        onChange={e => setWithdraws(w => ({ ...w, [s.index]: { ...(w[s.index] || { amount: '', to: '' }), to: e.target.value } }))}
                        className="bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder="Recipient 0x…" />
                      <div className="flex gap-2">
                        <input
                          value={withdraws[s.index]?.amount || ''}
                          onChange={e => setWithdraws(w => ({ ...w, [s.index]: { ...(w[s.index] || { amount: '', to: '' }), amount: e.target.value } }))}
                          className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder={`Max ${parseFloat(s.faucetBalance).toLocaleString(undefined, { maximumFractionDigits: 4 })}`} />
                        <button onClick={() => adminWithdraw(s)} disabled={busy === `wd-${s.index}`}
                          className="px-2 py-1.5 rounded-md bg-wolf-red/20 border border-wolf-red/40 text-[11px] font-bold text-wolf-red hover:bg-wolf-red/30 disabled:opacity-50">
                          {busy === `wd-${s.index}` ? '…' : 'Withdraw'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* setUserClaimCount (reset) */}
                  <div className="rounded-lg bg-wolf-surface/40 border border-wolf-border/20 p-3 md:col-span-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reset User Claim Count</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        value={resetUsers[s.index] || ''}
                        onChange={e => setResetUsers(r => ({ ...r, [s.index]: e.target.value }))}
                        className="flex-1 bg-wolf-surface border border-wolf-border/40 rounded-md px-2 py-1.5 text-[11px] font-mono" placeholder="User 0x…" />
                      <button onClick={() => resetUserCount(s)} disabled={busy === `ru-${s.index}`}
                        className="px-2 py-1.5 rounded-md bg-wolf-pink/20 border border-wolf-pink/40 text-[11px] font-bold hover:bg-wolf-pink/30 disabled:opacity-50">
                        {busy === `ru-${s.index}` ? '…' : 'Reset to 0'}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Sets the user's claim counter back to 0 for this token (lets them claim again after hitting max).</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
