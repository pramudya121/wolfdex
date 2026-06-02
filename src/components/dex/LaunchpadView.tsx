import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';
import { CONTRACTS, CHAIN_CONFIG, type TokenInfo, NATIVE_TOKEN } from '@/config/contracts';
import { LAUNCHPAD_ABI, ERC20_ABI } from '@/config/abis';
import { useDexContext } from '@/context/DexContext';
import { useCustomTokens } from '@/hooks/useCustomTokens';
import { useLaunchpadRegistry, uploadTokenLogo, registerToken, getRegistryToken } from '@/hooks/useLaunchpadRegistry';
import { getReadProvider, decodeRpcError } from '@/lib/rpc';
import CreatePairModal from './CreatePairModal';
import TextGenerateEffect from './ui/TextGenerateEffect';

const FALLBACK_LOGO = '/images/wdex-logo.png';

interface DeployedRow {
  address: string;
  name?: string;
  symbol?: string;
  totalSupply?: string;
  logo?: string;
  creator?: string;
  verified?: boolean;
}

function fmtNum(n: number | string | undefined): string {
  const x = Number(n ?? 0);
  if (!isFinite(x)) return '0';
  if (x >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (x >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  if (x >= 1e3) return (x / 1e3).toFixed(2) + 'K';
  return x.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const STORAGE_KEY = 'wolfdex.launchpad.tokens.v1';
type LogoMap = Record<string, string>; // address(lower) -> data url

function loadLogoMap(): LogoMap {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveLogoMap(map: LogoMap) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export default function LaunchpadView() {
  const { wallet } = useDexContext();
  const { addToken } = useCustomTokens();
  const { tokens: registryTokens } = useLaunchpadRegistry();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [deploying, setDeploying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [deployed, setDeployed] = useState<DeployedRow[]>([]);
  const [totalDeployed, setTotalDeployed] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const [pairModal, setPairModal] = useState(false);
  const [newToken, setNewToken] = useState<TokenInfo | null>(null);

  const symClean = useMemo(() => symbol.trim().toUpperCase().replace(/\s+/g, ''), [symbol]);
  const supplyNum = useMemo(() => Number(supply.replace(/[, ]/g, '')) || 0, [supply]);

  const myAddr = wallet.address?.toLowerCase() || '';
  const filteredDeployed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deployed.filter(t => {
      if (onlyMine && (!myAddr || t.creator?.toLowerCase() !== myAddr)) return false;
      if (!q) return true;
      return (
        t.address.toLowerCase().includes(q) ||
        t.symbol?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q)
      );
    });
  }, [deployed, search, onlyMine, myAddr]);

  const totalSupplySum = useMemo(
    () => deployed.reduce((acc, t) => acc + Number(t.totalSupply || 0), 0),
    [deployed],
  );

  // Load every token deployed via the launchpad
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingList(true);
        const provider = getReadProvider();
        const launch = new ethers.Contract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI, provider);
        const all: string[] = await launch.getAllTokens();
        if (!cancelled) setTotalDeployed(all.length);
        const logoMap = loadLogoMap();

        // Map token => creator from TokenDeployed events (best-effort)
        const creatorMap: Record<string, string> = {};
        try {
          const filter = launch.filters.TokenDeployed();
          const events = await launch.queryFilter(filter, 0, 'latest');
          for (const ev of events) {
            const tok = (ev.args?.token || '').toLowerCase();
            const creator = (ev.args?.creator || '').toLowerCase();
            if (tok) creatorMap[tok] = creator;
          }
        } catch (e) {
          console.warn('TokenDeployed events fetch failed', e);
        }

        // Resolve metadata per token (parallel, capped)
        const slice = all.slice(-30).reverse(); // newest 30 first
        const rows = await Promise.all(slice.map(async (addr) => {
          try {
            const c = new ethers.Contract(addr, ERC20_ABI, provider);
            const [n, s, ts] = await Promise.all([
              c.name().catch(() => 'Unknown'),
              c.symbol().catch(() => '?'),
              c.totalSupply().catch(() => ethers.constants.Zero),
            ]);
            const reg = getRegistryToken(addr);
            const row: DeployedRow = {
              address: addr,
              name: reg?.name || String(n),
              symbol: reg?.symbol || String(s),
              totalSupply: ethers.utils.formatUnits(ts, 18),
              logo: reg?.logo_url || logoMap[addr.toLowerCase()] || FALLBACK_LOGO,
              creator: creatorMap[addr.toLowerCase()],
              verified: !!reg?.verified,
            };
            // Auto-register so it shows up in TokenModal everywhere
            addToken({
              address: ethers.utils.getAddress(addr),
              symbol: row.symbol!,
              name: row.name!,
              decimals: 18,
              logo: row.logo!,
            });
            return row;
          } catch {
            return { address: addr } as DeployedRow;
          }
        }));
        if (!cancelled) setDeployed(rows);
      } catch (e) {
        console.warn('Launchpad list load failed', e);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptLogoFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      toast.error('Unsupported image', { description: 'Use PNG, JPG, GIF, or WEBP.' });
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error('Logo is too large', { description: 'Maximum 512 KB. Compress your image first.' });
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => acceptLogoFile(e.target.files?.[0]);
  const handleLogoDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    acceptLogoFile(e.dataTransfer.files?.[0]);
  };
  const clearLogo = () => {
    setLogoFile(null); setLogoPreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const validate = (): string | null => {
    if (!wallet.signer) return 'Connect your wallet first';
    if (!name.trim()) return 'Token name is required';
    if (name.trim().length > 32) return 'Token name must be 32 characters or less';
    if (!symClean) return 'Token symbol is required';
    if (symClean.length > 11) return 'Token symbol must be 11 characters or less';
    if (!supplyNum || supplyNum <= 0) return 'Total supply must be greater than zero';
    if (supplyNum > 1e15) return 'Supply is too large';
    return null;
  };

  const handleDeploy = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    setDeploying(true);
    try {
      const launch = new ethers.Contract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI, wallet.signer!);
      const tx = await launch.createToken(name.trim(), symClean, ethers.BigNumber.from(supplyNum));
      toast.info('Deploying token…', { description: 'Confirm the transaction in your wallet and wait for the chain.' });
      const receipt = await tx.wait();

      // Parse TokenDeployed event
      const iface = new ethers.utils.Interface(LAUNCHPAD_ABI);
      let deployedAddr: string | null = null;
      for (const log of receipt.logs ?? []) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name === 'TokenDeployed') { deployedAddr = parsed.args.token; break; }
        } catch {}
      }
      if (!deployedAddr) {
        // Fallback: read latest from contract list
        const provider = getReadProvider();
        const launchR = new ethers.Contract(CONTRACTS.LAUNCHPAD, LAUNCHPAD_ABI, provider);
        const all: string[] = await launchR.getAllTokens();
        deployedAddr = all[all.length - 1] ?? null;
      }
      if (!deployedAddr) throw new Error('TokenDeployed event was not found');

      const checksum = ethers.utils.getAddress(deployedAddr);

      // Read truth from chain — name/symbol/decimals (don't trust the form)
      const provider = getReadProvider();
      const erc = new ethers.Contract(checksum, ERC20_ABI, provider);
      const [onName, onSymbol, onDecimals, onSupply] = await Promise.all([
        erc.name().catch(() => name.trim()),
        erc.symbol().catch(() => symClean),
        erc.decimals().catch(() => 18),
        erc.totalSupply().catch(() => ethers.constants.Zero),
      ]);
      const realName = String(onName);
      const realSymbol = String(onSymbol);
      const realDecimals = Number(onDecimals) || 18;

      // Upload logo to public storage (so every user/device sees it)
      let finalLogo = FALLBACK_LOGO;
      if (logoFile) {
        try {
          finalLogo = await uploadTokenLogo(logoFile, checksum);
        } catch (upErr: any) {
          console.warn('Logo upload failed, using fallback', upErr);
          toast.warning('Logo upload failed', { description: 'Token deployed without a custom logo.' });
        }
      }

      // Register globally in the public DB so every visitor on every page sees it
      try {
        await registerToken({
          address: checksum,
          name: realName,
          symbol: realSymbol,
          decimals: realDecimals,
          logo_url: finalLogo === FALLBACK_LOGO ? null : finalLogo,
          creator: myAddr || null,
        });
      } catch (regErr) {
        console.warn('Registry insert failed', regErr);
      }

      // Local cache for token modal in this session
      const tokenInfo: TokenInfo = {
        address: checksum,
        symbol: realSymbol,
        name: realName,
        decimals: realDecimals,
        logo: finalLogo,
      };
      addToken(tokenInfo);

      toast.success('Token deployed! 🚀', {
        description: `${realSymbol} · ${checksum.slice(0,6)}…${checksum.slice(-4)}`,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${receipt.transactionHash}`, '_blank') },
      });

      // Update local list (use on-chain values)
      setDeployed(prev => [{
        address: checksum,
        name: realName,
        symbol: realSymbol,
        totalSupply: ethers.utils.formatUnits(onSupply, realDecimals),
        logo: finalLogo,
        creator: myAddr || undefined,
      }, ...prev]);
      setTotalDeployed(n => n + 1);

      // Reset form
      setName(''); setSymbol(''); setSupply('1000000');
      setLogoFile(null); setLogoPreview('');
      if (fileRef.current) fileRef.current.value = '';

      // Open Create Pair flow with the new token preselected as Token A
      setNewToken(tokenInfo);
      setPairModal(true);
    } catch (e: any) {
      toast.error('Deploy failed', { description: decodeRpcError(e) });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="relative max-w-6xl mx-auto px-4 pt-6 pb-20">
      {/* Hero */}
      <div className="text-center mb-10 relative">
        <div className="spotlight w-[600px] h-[260px] -top-10 left-1/2 -translate-x-1/2 pointer-events-none" />
        <h1 className="text-4xl sm:text-5xl font-black wolf-gradient-text mb-3 relative z-10">
          <TextGenerateEffect text="ERC20 Launchpad" />
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto relative z-10">
          <TextGenerateEffect text="Deploy your token in a single transaction and register it across WolfDex automatically." delay={0.3} />
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Tokens', value: fmtNum(totalDeployed), icon: '🚀' },
          { label: 'Aggregate Supply', value: fmtNum(totalSupplySum), icon: '∑' },
          { label: 'Your Tokens', value: myAddr ? String(registryTokens.filter(t => t.creator?.toLowerCase() === myAddr).length) : '—', icon: '👤' },
          { label: 'Network', value: CHAIN_CONFIG.symbol, icon: '🌐' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="wolf-card rounded-2xl p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-wolf-surface flex items-center justify-center text-lg shrink-0">{s.icon}</div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{s.label}</div>
              <div className="font-bold text-base truncate">{s.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* FORM — 3 cols */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotateX: -8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ transformPerspective: 1200 }}
          className="lg:col-span-3 wolf-card rounded-3xl p-6 sm:p-8 relative overflow-hidden"
        >
          {/* Animated glow accent */}
          <motion.div
            aria-hidden
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-30 pointer-events-none"
            style={{ background: 'radial-gradient(closest-side, oklch(0.65 0.25 330 / 60%), transparent)' }}
            animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />

          <div className="flex items-center gap-3 mb-6 relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-wolf-red/30 to-wolf-pink/20 border border-wolf-red/40 flex items-center justify-center text-xl">🚀</div>
            <div>
              <h2 className="text-xl font-bold">Create Your Token</h2>
              <p className="text-xs text-muted-foreground">Deployer: SimpleERC20 · 18 decimals · total supply sent to your wallet</p>
            </div>
          </div>

          {/* Logo + token name preview */}
          <div className="grid sm:grid-cols-[140px_1fr] gap-5 mb-5 relative">
            <motion.label
              whileHover={{ scale: 1.04, rotateY: 8 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 220, damping: 16 }}
              style={{ transformPerspective: 800 }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleLogoDrop}
              className={`cursor-pointer aspect-square rounded-2xl border-2 border-dashed bg-wolf-surface/40 hover:bg-wolf-surface flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground transition-all overflow-hidden relative group ${
                dragOver ? 'border-wolf-pink scale-[1.03] bg-wolf-surface' : 'border-wolf-border/60 hover:border-wolf-red/60'
              }`}
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearLogo(); }}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-wolf-red text-white text-xs flex items-center justify-center backdrop-blur"
                    aria-label="Remove logo"
                  >✕</button>
                  <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-center text-white bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    Click or drop to replace
                  </div>
                </>
              ) : (
                <>
                  <span className="text-3xl group-hover:scale-110 transition-transform">{dragOver ? '⬇️' : '🖼️'}</span>
                  <span className="font-medium text-foreground/80">{dragOver ? 'Drop image' : 'Upload logo'}</span>
                  <span className="text-[10px] opacity-60">PNG/JPG/WEBP · ≤512 KB</span>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleLogoChange} className="hidden" />
            </motion.label>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Token Name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value.slice(0, 32))}
                  placeholder="WolfDex Pro Token"
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-wolf-surface border border-wolf-border/40 focus:border-wolf-red/60 focus:outline-none transition-colors text-base"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Symbol</label>
                <input
                  value={symbol}
                  onChange={e => setSymbol(e.target.value.slice(0, 11))}
                  placeholder="WPRO"
                  className="mt-1 w-full px-4 py-3 rounded-xl bg-wolf-surface border border-wolf-border/40 focus:border-wolf-red/60 focus:outline-none uppercase tracking-wider font-bold"
                />
              </div>
            </div>
          </div>

          <div className="mb-5">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Supply</label>
            <div className="mt-1 relative">
              <input
                value={supply}
                onChange={e => setSupply(e.target.value.replace(/[^0-9,]/g, ''))}
                placeholder="1000000"
                inputMode="numeric"
                className="w-full px-4 py-3 pr-24 rounded-xl bg-wolf-surface border border-wolf-border/40 focus:border-wolf-red/60 focus:outline-none text-base font-mono"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{symClean || 'TOKEN'}</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {['1000000', '10000000', '100000000', '1000000000'].map(v => (
                <button
                  key={v}
                  onClick={() => setSupply(v)}
                  className="text-xs px-3 py-1 rounded-full bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 transition-colors"
                >{Number(v).toLocaleString('en-US')}</button>
              ))}
            </div>
          </div>

          {/* Live preview card */}
          <motion.div
            layout
            className="rounded-2xl p-4 mb-6 bg-gradient-to-br from-wolf-surface to-wolf-surface/40 border border-wolf-border/40 flex items-center gap-4"
          >
            <motion.div
              animate={{ rotateY: [0, 360] }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
              style={{ transformPerspective: 600 }}
              className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-wolf-red/40 flex items-center justify-center bg-wolf-surface shrink-0"
            >
              {logoPreview
                ? <img src={logoPreview} alt="" className="w-full h-full object-cover" />
                : <span className="text-2xl">🐺</span>}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="font-bold truncate">{name || 'Token Name'}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{symClean || 'SYMBOL'}</span> · supply <span className="font-mono">{supplyNum.toLocaleString('en-US')}</span>
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Decimals</div>
              <div className="font-mono text-foreground">18</div>
            </div>
          </motion.div>

          <motion.button
            onClick={handleDeploy}
            disabled={deploying || !wallet.signer}
            whileHover={{ scale: deploying || !wallet.signer ? 1 : 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-4 rounded-2xl wolf-btn-primary font-bold text-base disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
          >
            {!deploying && wallet.signer && (
              <motion.span
                aria-hidden
                className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1.2 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
              {deploying && (
                <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              )}
              {!wallet.signer ? 'Connect Wallet to Deploy'
                : deploying ? 'Deploying… (confirm in wallet)'
                : `🚀 Deploy ${symClean || 'TOKEN'}`}
            </span>
          </motion.button>
          <p className="mt-3 text-[11px] text-center text-muted-foreground">
            After deployment, you will be routed into <span className="text-wolf-pink">Create New Pair</span> to add the first liquidity.
          </p>
        </motion.div>

        {/* DEPLOYED LIST — 2 cols */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotateX: -8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
          style={{ transformPerspective: 1200 }}
          className="lg:col-span-2 wolf-card rounded-3xl p-6 relative overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Recently Deployed</h2>
            <span className="text-xs text-muted-foreground">{filteredDeployed.length}/{deployed.length}</span>
          </div>

          {/* Search + filter */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, symbol, or address…"
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-wolf-surface/60 border border-wolf-border/40 focus:border-wolf-red/60 focus:outline-none text-xs"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">🔎</span>
            </div>
            <button
              onClick={() => setOnlyMine(v => !v)}
              disabled={!myAddr}
              title={myAddr ? 'Filter your tokens' : 'Connect wallet'}
              className={`shrink-0 text-xs px-2.5 py-2 rounded-lg border transition-colors disabled:opacity-40 ${
                onlyMine
                  ? 'bg-wolf-red/20 border-wolf-red/50 text-wolf-pink'
                  : 'bg-wolf-surface/60 border-wolf-border/40 hover:border-wolf-red/40'
              }`}
            >👤 Mine</button>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[520px] pr-1 -mr-1">
            {loadingList && (
              <div className="text-center text-sm text-muted-foreground py-12">Loading on-chain…</div>
            )}
            {!loadingList && deployed.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                No tokens yet. Be the first to launch one 🐺
              </div>
            )}
            {!loadingList && deployed.length > 0 && filteredDeployed.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-12">
                No tokens match the current filter.
              </div>
            )}
            <AnimatePresence initial={false}>
              {filteredDeployed.map((t, i) => {
                const isMine = !!myAddr && t.creator?.toLowerCase() === myAddr;
                const short = `${t.address.slice(0, 6)}…${t.address.slice(-4)}`;
                return (
                  <motion.div
                    key={t.address}
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className="group p-3 rounded-xl bg-wolf-surface/60 hover:bg-wolf-surface border border-wolf-border/30 hover:border-wolf-red/40 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={t.logo || FALLBACK_LOGO}
                        alt=""
                        className="w-9 h-9 rounded-full ring-1 ring-wolf-border/50 object-cover bg-wolf-surface shrink-0 cursor-pointer"
                        onClick={() => navigate({ to: '/token/$address', params: { address: t.address } })}
                        onError={e => { (e.target as HTMLImageElement).src = FALLBACK_LOGO; }}
                      />
                      <button
                        onClick={() => navigate({ to: '/token/$address', params: { address: t.address } })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-semibold text-sm truncate flex items-center gap-1.5 hover:text-wolf-pink transition-colors">
                          {t.name || '—'} <span className="text-muted-foreground font-normal">({t.symbol || '?'})</span>
                          {isMine && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-wolf-gold/20 text-wolf-gold border border-wolf-gold/40 uppercase tracking-wide">mine</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span className="font-mono">{short}</span>
                          {t.totalSupply && <span>· supply {fmtNum(t.totalSupply)}</span>}
                        </div>
                      </button>
                    </div>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(t.address);
                          toast.success('Address copied', { description: t.address });
                        }}
                        className="text-[11px] px-2 py-1 rounded-md bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40"
                      >📋 Copy</button>
                      <a
                        href={`${CHAIN_CONFIG.blockExplorer}/address/${t.address}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[11px] px-2 py-1 rounded-md bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40"
                      >🔗 Explorer</a>
                      <button
                        onClick={() => navigate({ to: '/swap' })}
                        className="text-[11px] px-2 py-1 rounded-md bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40"
                      >💱 Trade</button>
                      <button
                        onClick={() => {
                          setNewToken({
                            address: t.address,
                            symbol: t.symbol || '?',
                            name: t.name || 'Unknown',
                            decimals: 18,
                            logo: t.logo || FALLBACK_LOGO,
                          });
                          setPairModal(true);
                        }}
                        className="ml-auto text-[11px] px-2 py-1 rounded-md bg-wolf-red/15 hover:bg-wolf-red/25 text-wolf-pink border border-wolf-red/30"
                      >+ Liquidity</button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <CreatePairModal
        isOpen={pairModal}
        onClose={() => setPairModal(false)}
        signer={wallet.signer}
        prefillTokenA={newToken}
        prefillTokenB={NATIVE_TOKEN}
        onCreated={() => {
          setPairModal(false);
          // Then route to liquidity page so the user can add initial liquidity
          navigate({ to: '/liquidity' });
        }}
      />
    </div>
  );
}
