import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { CHAIN_CONFIG, CONTRACTS } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';
import { getReadProvider } from '@/lib/rpc';
import { getRegistryToken } from '@/hooks/useLaunchpadRegistry';
import { useDexContext } from '@/context/DexContext';

export const Route = createFileRoute('/token/$address')({
  head: ({ params }) => {
    const short = `${params.address.slice(0, 8)}…${params.address.slice(-6)}`;
    const title = `Token ${short} — WolfDex`;
    const description = `On-chain ERC-20 token details for ${params.address} on LitVM LiteForge Testnet. View total supply, your balance, creator, and trade or add liquidity on WolfDex.`;
    const url = `https://wolfdex.lovable.app/token/${params.address}`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  component: TokenDetailPage,
  notFoundComponent: () => (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold mb-2">Token not found</h1>
      <Link to="/launchpad" className="text-wolf-pink underline">Back to Launchpad</Link>
    </div>
  ),
});

interface TokenData {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  logo: string;
  creator?: string | null;
  yourBalance?: string;
}

function TokenDetailPage() {
  const { address: rawAddr } = useParams({ from: '/token/$address' });
  const { wallet } = useDexContext();
  const [data, setData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  let address = rawAddr;
  try { address = ethers.utils.getAddress(rawAddr); } catch { /* keep raw */ }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const provider = getReadProvider();
        const c = new ethers.Contract(address, ERC20_ABI, provider);
        const reg = getRegistryToken(address);
        const [n, s, dec, ts, bal] = await Promise.all([
          c.name().catch(() => reg?.name || 'Unknown'),
          c.symbol().catch(() => reg?.symbol || '?'),
          c.decimals().catch(() => 18),
          c.totalSupply().catch(() => ethers.constants.Zero),
          wallet.address ? c.balanceOf(wallet.address).catch(() => ethers.constants.Zero) : Promise.resolve(ethers.constants.Zero),
        ]);
        if (cancelled) return;
        const decimals = Number(dec) || 18;
        setData({
          name: reg?.name || String(n),
          symbol: reg?.symbol || String(s),
          decimals,
          totalSupply: ethers.utils.formatUnits(ts, decimals),
          logo: reg?.logo_url || '/images/wdex-logo.png',
          creator: reg?.creator,
          yourBalance: wallet.address ? ethers.utils.formatUnits(bal, decimals) : undefined,
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load token');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address, wallet.address]);

  const copy = () => {
    navigator.clipboard.writeText(address);
    toast.success('Address copied');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-20">
      <div className="mb-4">
        <Link to="/launchpad" className="text-xs text-muted-foreground hover:text-wolf-pink">← Back to Launchpad</Link>
      </div>

      {loading && <div className="text-center text-muted-foreground py-20">Loading token data…</div>}
      {error && <div className="text-center text-wolf-red py-20">{error}</div>}

      {data && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="wolf-card rounded-3xl p-6 sm:p-8 mb-6 relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <img
                src={data.logo}
                alt={data.symbol}
                className="w-20 h-20 rounded-2xl ring-2 ring-wolf-pink/40 object-cover bg-wolf-surface shrink-0"
                onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }}
              />
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl font-black wolf-gradient-text truncate">{data.name}</h1>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <span className="font-mono font-bold text-foreground">{data.symbol}</span>
                  <span>·</span>
                  <span>{data.decimals} decimals</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40 font-mono">
                    {address.slice(0, 10)}…{address.slice(-6)} 📋
                  </button>
                  <a
                    href={`${CHAIN_CONFIG.blockExplorer}/address/${address}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/40"
                  >🔗 Explorer</a>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid sm:grid-cols-3 gap-3 mb-6">
            <Stat label="Total Supply" value={Number(data.totalSupply).toLocaleString(undefined, { maximumFractionDigits: 2 })} />
            <Stat label="Your Balance" value={data.yourBalance ? Number(data.yourBalance).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '— connect wallet'} />
            <Stat label="Creator" value={data.creator ? `${data.creator.slice(0, 6)}…${data.creator.slice(-4)}` : 'Unknown'} mono />
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Link to="/swap" className="wolf-pool-card rounded-2xl p-5 text-center hover:scale-[1.02] transition-transform">
              <div className="text-2xl mb-2">💱</div>
              <div className="font-bold">Trade</div>
              <div className="text-xs text-muted-foreground">Swap this token</div>
            </Link>
            <Link to="/liquidity" className="wolf-pool-card rounded-2xl p-5 text-center hover:scale-[1.02] transition-transform">
              <div className="text-2xl mb-2">🌊</div>
              <div className="font-bold">Add Liquidity</div>
              <div className="text-xs text-muted-foreground">Provide liquidity & earn fees</div>
            </Link>
            <Link to="/pools" className="wolf-pool-card rounded-2xl p-5 text-center hover:scale-[1.02] transition-transform">
              <div className="text-2xl mb-2">🐺</div>
              <div className="font-bold">Find Pools</div>
              <div className="text-xs text-muted-foreground">Browse pairs</div>
            </Link>
          </div>

          <div className="mt-6 text-[11px] text-center text-muted-foreground">
            Network: {CHAIN_CONFIG.chainName} (Chain ID {CHAIN_CONFIG.chainId}) · Router {CONTRACTS.ROUTER.slice(0, 8)}…
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="wolf-card rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
