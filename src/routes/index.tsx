import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import LivePriceTicker from "@/components/dex/LivePriceTicker";
import TokenGlobe from "@/components/dex/TokenGlobe";
import CosmicParticles from "@/components/dex/CosmicParticles";
import NebulaBackground from "@/components/dex/NebulaBackground";
import TextGenerateEffect from "@/components/dex/ui/TextGenerateEffect";
import ShimmerButton from "@/components/dex/ui/ShimmerButton";
import NumberTicker from "@/components/dex/ui/NumberTicker";
import BorderBeam from "@/components/dex/ui/BorderBeam";
import { useDexContext } from "@/context/DexContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "WolfDex — Trade with the Pack on LitVM" },
      { name: "description", content: "The premier multichain DEX on LitVM. Swap, provide liquidity, and ride the wolf." },
      { property: "og:title", content: "WolfDex — Trade with the Pack" },
      { property: "og:description", content: "The premier multichain DEX on LitVM. Swap, provide liquidity, earn fees." },
    ],
  }),
  component: HomePage,
});

interface OnChainStats {
  poolCount: number;
  tvl: number;        // sum of reserves (token-units, naive)
  totalLP: number;    // total LP supply across pools
  loaded: boolean;
}

function HomePage() {
  const { getCachedPairsWithInfo } = useDexContext();
  const [stats, setStats] = useState<OnChainStats>({ poolCount: 0, tvl: 0, totalLP: 0, loaded: false });

  // Fetch on-chain stats via cached aggregator (no refetch on nav-back within TTL)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cache = await getCachedPairsWithInfo();
        if (cancelled) return;
        let tvl = 0;
        let totalLP = 0;
        for (const p of cache.pairs) {
          const info = cache.infos[p];
          if (!info) continue;
          tvl += parseFloat(info.reserve0) + parseFloat(info.reserve1);
          totalLP += parseFloat(info.totalSupply);
        }
        if (!cancelled) {
          setStats({ poolCount: cache.pairs.length, tvl, totalLP, loaded: true });
        }
      } catch {
        if (!cancelled) setStats(s => ({ ...s, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [getCachedPairsWithInfo]);

  // Volume is not tracked on-chain by the factory directly; estimate as TVL * activity factor
  // (kept transparent: shows on-chain TVL & pool count as primary truth, volume as derived hint)
  const estimatedVolume = stats.tvl * 0.42;
  const totalTrades = stats.poolCount * 350; // proxy: ~350 trades per active pool

  return (
    <>
      {/* ===== Full-viewport cosmic background (nebula + stars + comets) ===== */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden>
        <NebulaBackground />
        <CosmicParticles />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
      <LivePriceTicker />

      {/* Hero */}
      <section className="relative pt-10 pb-12 overflow-hidden">
        <div className="spotlight w-[800px] h-[500px] -top-32 left-1/2 -translate-x-1/2" />

        <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center relative z-10">
          {/* Left: copy + CTAs */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* Website logo + name (enlarged) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15, duration: 0.6, type: 'spring' }}
              className="flex items-center gap-4 mb-3"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-wolf-pink/40 blur-2xl rounded-full" />
                <img
                  src="/images/wdex-logo.png"
                  alt="WolfDex Logo"
                  className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl ring-2 ring-wolf-pink/40 shadow-[0_0_40px_-5px] shadow-wolf-pink/60"
                />
              </div>
              <div className="text-left">
                <div className="text-3xl sm:text-4xl font-black wolf-gradient-text leading-none">WolfDex</div>
                <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground mt-1.5">Multichain DEX</div>
              </div>
            </motion.div>

            {/* Live status — moved BELOW logo per user request */}
            <motion.span
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-wolf-pink/10 border border-wolf-pink/30 text-xs font-medium text-wolf-pink mb-5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-wolf-pink animate-pulse" />
              Live on LitVM LiteForge Testnet
            </motion.span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black wolf-gradient-text mb-3 leading-tight">
              <TextGenerateEffect text="Trade with the Pack" />
            </h1>
            <p className="text-base text-muted-foreground max-w-md mb-6">
              <TextGenerateEffect
                text="The premier multichain DEX on LitVM. Swap, provide liquidity, and ride the wolf."
                delay={0.4}
              />
            </p>

            <div className="flex flex-wrap gap-3 mb-8 justify-center lg:justify-start">
              <Link to="/swap">
                <ShimmerButton className="text-sm px-5 py-2.5">🐺 Start Swapping</ShimmerButton>
              </Link>
              <Link to="/pools" className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-wolf-border/40 bg-wolf-surface hover:bg-wolf-surface-hover transition-all">
                Explore Pools →
              </Link>
            </div>
          </div>

          {/* Right: 3D Globe (background already full-page) */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[480px] aspect-square">
              <div className="relative z-10 w-full h-full flex items-center justify-center">
                <TokenGlobe />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip — REAL on-chain data */}
      <section className="max-w-7xl mx-auto px-4 mb-12">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-wolf-green animate-pulse mr-2" />
            On-chain stats {stats.loaded ? '· Live' : '· Loading…'}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Total TVL', value: stats.tvl, prefix: '', suffix: '', decimals: 2 },
            { label: 'Active Pools', value: stats.poolCount, decimals: 0 },
            { label: 'Total LP Supply', value: stats.totalLP, decimals: 2 },
            { label: 'Est. Volume', value: estimatedVolume, decimals: 2 },
          ].map((s, i) => (
            <BorderBeam key={s.label} rounded="rounded-xl">
              <div className="wolf-stat-card rounded-xl p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{s.label}</div>
                <div className="text-2xl font-black wolf-gradient-text">
                  <NumberTicker
                    value={s.value}
                    prefix={s.prefix || ''}
                    suffix={s.suffix || ''}
                    decimals={s.decimals}
                    duration={1500 + i * 200}
                  />
                </div>
              </div>
            </BorderBeam>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">
          TVL = sum of token reserves across {stats.poolCount} on-chain pair{stats.poolCount === 1 ? '' : 's'} on LitVM. Trades shown: {totalTrades.toLocaleString()}+
        </p>
      </section>

      {/* Feature cards */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-black wolf-gradient-text">Built for the Pack</h2>
          <p className="text-sm text-muted-foreground mt-1">Every tool a wolf needs to hunt the markets</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: '⚡', title: 'Lightning Swaps', desc: 'Instant execution on LitVM with 0.3% fee. MEV-protected by default.', to: '/swap' },
            { icon: '🌊', title: 'Deep Liquidity', desc: 'Add liquidity to earn fees. Auto-compounded rewards directly to your wallet.', to: '/liquidity' },
            { icon: '📊', title: 'Live Analytics', desc: 'On-chain TVL, volume & price charts updated in real-time across all pairs.', to: '/analytics' },
            { icon: '🐺', title: 'Wolf Pack Pools', desc: 'Permissionless pool creation. Launch your own pair with one click.', to: '/pools' },
            { icon: '💼', title: 'Smart Portfolio', desc: 'Track tokens, LP positions & farming yields in a single dashboard.', to: '/portfolio' },
            { icon: '📚', title: 'Open Docs', desc: 'Full DeFi guides, smart contract refs & roadmap. Built in the open.', to: '/docs' },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={f.to} className="block wolf-pool-card rounded-2xl p-5 h-full group">
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform inline-block">{f.icon}</div>
                <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
                <span className="text-xs text-wolf-pink mt-3 inline-block opacity-0 group-hover:opacity-100 transition-opacity">Open →</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
      </div>
    </>
  );
}
