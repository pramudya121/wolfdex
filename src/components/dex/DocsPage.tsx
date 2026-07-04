import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { CONTRACTS, TOKENS, CHAIN_CONFIG, DNS_TLD } from '@/config/contracts';

type Section = 
  | 'introduction' | 'connect-wallet' | 'get-testnet-tokens'
  | 'how-to-swap' | 'provide-liquidity' | 'portfolio-send' | 'analytics-pairs' | 'settings'
  | 'amm-pricing' | 'impermanent-loss' | 'slippage-price-impact' | 'lp-tokens-fees'
  | 'technology-stack' | 'smart-contracts' | 'supported-tokens'
  | 'roadmap' | 'faq';

interface NavItem {
  id: Section;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'GETTING STARTED',
    items: [
      { id: 'introduction', label: 'Introduction' },
      { id: 'connect-wallet', label: 'Connect Wallet' },
      { id: 'get-testnet-tokens', label: 'Get Testnet Tokens' },
    ],
  },
  {
    title: 'USER GUIDES',
    items: [
      { id: 'how-to-swap', label: 'How to Swap' },
      { id: 'provide-liquidity', label: 'Provide Liquidity' },
      { id: 'portfolio-send', label: 'Portfolio & Send' },
      { id: 'analytics-pairs', label: 'Analytics & Pairs' },
    ],
  },
  {
    title: 'DEFI CONCEPTS',
    items: [
      { id: 'amm-pricing', label: 'AMM & Pricing' },
      { id: 'impermanent-loss', label: 'Impermanent Loss' },
      { id: 'slippage-price-impact', label: 'Slippage & Price Impact' },
      { id: 'lp-tokens-fees', label: 'LP Tokens & Fees' },
    ],
  },
  {
    title: 'TECHNICAL',
    items: [
      { id: 'technology-stack', label: 'Technology Stack' },
      { id: 'smart-contracts', label: 'Smart Contracts' },
      { id: 'supported-tokens', label: 'Supported Tokens' },
    ],
  },
  {
    title: 'ROADMAP & FAQ',
    items: [
      { id: 'roadmap', label: 'Development Roadmap' },
      { id: 'faq', label: 'FAQ' },
    ],
  },
];

const FEATURES = [
  { icon: '🔄', title: 'Token Swap', desc: 'Instantly trade tokens with AMM pricing' },
  { icon: '💧', title: 'Liquidity Pools', desc: 'Provide liquidity and earn 0.3% fees' },
  { icon: '📊', title: 'Analytics', desc: 'Real-time charts, TVL, volume, pair data' },
  { icon: '📁', title: 'Portfolio', desc: 'Track holdings, LP positions, send tokens' },
  { icon: '🐺', title: 'WOLFDEX Token', desc: 'Native governance & utility token (WDEX)' },
  { icon: '📜', title: 'History', desc: 'Complete transaction history with details' },
];

/**
 * Professional DEX roadmap modeled after best-in-class projects (Uniswap,
 * GMX, Curve). Phases reflect realistic milestones for a serious DEX
 * protocol — from V2 core through V3 concentrated liquidity, perpetuals,
 * cross-chain, governance, and institutional integration.
 */
const ROADMAP = [
  {
    phase: 'Q4 2025',
    title: 'Foundation Layer',
    status: 'completed' as const,
    progress: 100,
    summary: 'Battle-tested AMM core deployed on LitVM with full multi-wallet support.',
    items: [
      'UniswapV2-fork core contracts (Factory, Router02, WETH9, Multicall) audited & deployed',
      'Multi-wallet integration: MetaMask, OKX, Rabby, Bitget — auto chain-switch',
      'AMM swap engine with constant-product (x·y=k) pricing & 0.3% LP fees',
      'Permissionless add/remove liquidity with proportional share calculation',
      'LitVM LiteForge Testnet (Chain ID 4441) launch + faucet integration',
    ],
  },
  {
    phase: 'Q1 2026',
    title: 'Core DEX Experience',
    status: 'completed' as const,
    progress: 100,
    summary: 'Production-grade UX with real-time data, MEV defense and global tx history.',
    items: [
      'Portfolio dashboard: live balances, LP positions, unrealized fees',
      'Pool explorer with TVL ranking, search, sort & one-click create-pair',
      'On-chain analytics with cached aggregator for instant page transitions',
      'MEV-aware liquidity removal (slippage floor on amountAMin/amountBMin)',
      'Global tx history popover with localStorage persistence + per-wallet scope',
      'Expert mode + global slippage/deadline settings synced across pages',
    ],
  },
  {
    phase: 'Q2 2026',
    title: 'GameFi Casino & Yield Farms',
    status: 'completed' as const,
    progress: 100,
    summary: 'On-chain provably-fair casino with 8 games + multi-pool LP farming for WDEX emissions.',
    items: [
      'Casino smart contract with house bankroll, min/max bet bounds, and pause switch',
      '8 provably-fair games: Coinflip, Slot, Plinko, RPS, Video Poker, Roulette, Lucky Wheel, Spin to Win',
      'Lucky Wheel + Spin to Win: 8 token rewards (zkLTC, ETH, MON, BNB, LITVM, HYPE, WDEX, wzkLTC) balanced 1:1 with LOST slots',
      'On-chain randomness seeds the wheel layout — board reseeded from tx hash for verifiable fairness',
      'Auto-swap payouts via WolfDex Router so winners receive the actual reward token',
      'Win/Lose notifications + WebAudio sound effects with per-user mute toggle',
      'Persistent session stats (PnL, win rate, total wagered) + recent plays history',
      'Yield farming contract: stake LP tokens across multiple pools to earn WDEX emissions',
    ],
  },
  {
    phase: 'Q3 2026',
    title: 'Smart Order Routing',
    status: 'completed' as const,
    progress: 100,
    summary: 'Best-execution router that hops across pools to maximize output for every swap.',
    items: [
      'Multi-hop pathfinder (A → WETH → C) with on-chain reserve scoring',
      'Split routing across multiple pools for large-size trades',
      'Per-pair OHLC candlestick charts with on-chain Swap event indexing',
      'Custom token import via contract address (ERC20 metadata auto-detect)',
      'WDEX governance token TGE + initial liquidity bootstrap event',
      'Public read-only REST API for prices, pairs, and pool metrics',
    ],
  },
  {
    phase: 'Q4 2026',
    title: 'Casino V2 & Concentrated Liquidity',
    status: 'in-progress' as const,
    progress: 25,
    summary: 'Tournaments, jackpots, NFT rewards, plus tick-based concentrated liquidity (V3).',
    items: [
      'Casino V2: weekly tournaments, progressive jackpots, NFT trophy drops for top wagerers',
      'Multiplayer poker tables + live blackjack with on-chain shoe shuffle',
      'Tick-based concentrated liquidity engine with multiple fee tiers (0.05% / 0.3% / 1%)',
      'NFT-based LP positions with on-chain SVG art',
      'Active liquidity manager: auto-rebalance vaults for passive LPs',
      'Range orders (limit-order primitive built on V3 ticks)',
      'V2 → V3 migration assistant for existing liquidity providers',
    ],
  },
  {
    phase: 'Q1 2027',
    title: 'Perpetual Futures & Leverage',
    status: 'upcoming' as const,
    progress: 0,
    summary: 'Decentralized perp trading powered by WDEX-LP backed pools.',
    items: [
      'GLP-style multi-asset liquidity pool as counterparty for perps',
      'Up to 50× leverage on majors with real-time funding rates',
      'Isolated + cross-margin modes with on-chain stop-loss / take-profit',
      'Chainlink + Pyth dual oracle feeds with deviation circuit-breakers',
      'Insurance fund seeded by 0.05% of every spot swap + 1% of casino house edge',
      'Perp-spot arbitrage hooks for keeper bots',
    ],
  },
  {
    phase: 'Q2 2027',
    title: 'Cross-Chain & Bridge',
    status: 'upcoming' as const,
    progress: 0,
    summary: 'Unified liquidity across LitVM, Ethereum L2s, BNB Chain, Base & Solana.',
    items: [
      'LayerZero / Wormhole-powered cross-chain swap router',
      'Native bridge UI: deposit / withdraw with quote in <2 seconds',
      'Cross-chain LP positions: deposit on chain A, earn from volume on chain B',
      'Cross-chain casino bankroll — play from any supported chain',
      'Universal portfolio view across 8+ supported chains',
      'Gasless cross-chain swaps via meta-transactions',
    ],
  },
  {
    phase: 'Q3 2027',
    title: 'Governance & Tokenomics',
    status: 'upcoming' as const,
    progress: 0,
    summary: 'On-chain governance with veWDEX, fee-share to lockers, and protocol-owned liquidity.',
    items: [
      'veWDEX vote-escrow model (1w → 4y locks, boost up to 2.5×)',
      'Snapshot-based off-chain voting + on-chain execution timelock',
      'Gauge weight voting for fee distribution to selected pools and casino games',
      'Protocol-Owned Liquidity vault funded from treasury swap + casino fees',
      'WDEX buyback-and-burn financed by 1/6 of protocol revenue (DEX + casino)',
    ],
  },
  {
    phase: 'Q4 2027',
    title: 'Security & Mainnet Hardening',
    status: 'upcoming' as const,
    progress: 0,
    summary: 'Multiple independent audits, formal verification, and a live bug bounty.',
    items: [
      '3 independent audits (Trail of Bits, OpenZeppelin, Spearbit) covering DEX + Casino + Farming',
      'Formal verification of core swap, concentrated-liquidity math, and casino RNG',
      '$2M Immunefi bug bounty across all critical contracts',
      'Multi-sig + 48h timelock on all governance-sensitive parameters',
      'Real-time monitoring & on-chain circuit breakers',
      'Mainnet deployment with capped TVL phase (gradual cap raises)',
    ],
  },
  {
    phase: 'Q1 2028',
    title: 'Ecosystem & Institutional',
    status: 'upcoming' as const,
    progress: 0,
    summary: 'Launchpad, SDK, native mobile apps, and institutional liquidity desk.',
    items: [
      'Token launchpad with anti-bot fair-launch primitives',
      'Native iOS + Android apps with biometric wallet auth (DEX + Casino unified)',
      'TypeScript SDK + Python SDK for traders, quants, and casino bot builders',
      'Institutional desk: OTC quotes, RFQ, MPC custody integrations',
      'Grants program (5% of treasury) funding builders on top of WolfDex',
      'On-chain reputation & social-trading layer',
    ],
  },
];

function StatusBadge({ status }: { status: 'completed' | 'in-progress' | 'upcoming' }) {
  const styles = {
    completed: 'bg-wolf-green/20 text-wolf-green border-wolf-green/30',
    'in-progress': 'bg-wolf-gold/20 text-wolf-gold border-wolf-gold/30',
    upcoming: 'bg-wolf-purple/20 text-wolf-purple border-wolf-purple/30',
  };
  const labels = { completed: '✅ Completed', 'in-progress': '🔨 In Progress', upcoming: '🔮 Upcoming' };
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState<Section>('introduction');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredNav = NAV.map(g => ({
    ...g,
    items: g.items.filter(i => i.label.toLowerCase().includes(search.toLowerCase())),
  })).filter(g => g.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto flex gap-0 md:gap-6 relative">
      {/* Mobile toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed bottom-6 left-6 z-50 wolf-btn-primary w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {(sidebarOpen || true) && (
          <motion.aside
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className={`${sidebarOpen ? 'fixed inset-y-0 left-0 z-40 pt-20' : 'hidden md:block'} w-72 shrink-0`}
          >
            <div className="wolf-card rounded-2xl p-4 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin">
              {/* Search */}
              <div className="relative mb-4">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search docs..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="wolf-input w-full pl-9 pr-3 py-2 rounded-lg text-sm"
                />
              </div>

              {filteredNav.map(group => (
                <div key={group.title} className="mb-4">
                  <p className="text-[10px] font-bold tracking-widest text-muted-foreground/60 mb-2 px-2">{group.title}</p>
                  <div className="space-y-0.5">
                    {group.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => { setActive(item.id); setSidebarOpen(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                          active === item.id
                            ? 'bg-wolf-red/15 text-foreground border border-wolf-red/30 font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-wolf-surface-hover'
                        }`}
                      >
                        {active === item.id && <span className="w-1.5 h-1.5 rounded-full bg-wolf-red" />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {active === 'introduction' && <IntroSection />}
          {active === 'connect-wallet' && <ConnectWalletSection />}
          {active === 'get-testnet-tokens' && <GetTestnetTokensSection />}
          {active === 'how-to-swap' && <HowToSwapSection />}
          {active === 'provide-liquidity' && <ProvideLiquiditySection />}
          {active === 'portfolio-send' && <PortfolioSendSection />}
          {active === 'analytics-pairs' && <AnalyticsPairsSection />}
          {active === 'amm-pricing' && <AmmPricingSection />}
          {active === 'impermanent-loss' && <ImpermanentLossSection />}
          {active === 'slippage-price-impact' && <SlippageSection />}
          {active === 'lp-tokens-fees' && <LpTokensSection />}
          {active === 'technology-stack' && <TechStackSection />}
          {active === 'smart-contracts' && <SmartContractsSection />}
          {active === 'supported-tokens' && <SupportedTokensSection />}
          {active === 'roadmap' && <RoadmapSection />}
          {active === 'faq' && <FaqSection />}
        </motion.div>
      </main>
    </div>
  );
}

/* ============ SECTION COMPONENTS ============ */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="text-3xl md:text-4xl font-bold wolf-gradient-text mb-2">{children}</h1>;
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mb-8 max-w-2xl">{children}</p>;
}

function DocCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`wolf-card rounded-xl p-5 mb-4 ${className}`}>{children}</div>;
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-wolf-red/40 bg-wolf-red/5 p-4 mb-6 flex gap-3">
      <span className="text-wolf-red text-lg">💡</span>
      <p className="text-sm text-foreground/80">{children}</p>
    </div>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3 mb-6">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="w-7 h-7 rounded-full bg-wolf-red/20 text-wolf-red text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
          <span className="text-sm text-foreground/85">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function IntroSection() {
  return (
    <div>
      <SectionTitle>Welcome to WOLFDEX</SectionTitle>
      <SectionDesc>
        WOLFDEX is a decentralized exchange built on <span className="text-wolf-gold font-semibold">LitVM LiteForge Testnet</span>, powered by the battle-tested UniswapV2 protocol. Trade, provide liquidity, and earn — all without intermediaries.
      </SectionDesc>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {[
          { icon: '🔒', title: 'Non-Custodial', desc: 'You always maintain full control over your assets' },
          { icon: '⚡', title: 'Fast & Cheap', desc: 'Low gas fees on LitVM LiteForge Testnet' },
          { icon: '🔓', title: 'Open Source', desc: 'Verified and transparent smart contracts' },
        ].map(f => (
          <DocCard key={f.title}>
            <span className="text-2xl">{f.icon}</span>
            <h3 className="font-bold mt-2">{f.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
          </DocCard>
        ))}
      </div>

      <Tip>
        <strong>New to DeFi?</strong> Start by connecting your wallet, getting testnet tokens from the faucet, then try your first swap. Use the docs sidebar for help anytime!
      </Tip>

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">✨ Key Features</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FEATURES.map(f => (
          <DocCard key={f.title} className="wolf-card-hover cursor-default">
            <div className="flex items-center gap-3">
              <span className="text-2xl w-10 h-10 rounded-lg bg-wolf-surface flex items-center justify-center">{f.icon}</span>
              <div>
                <h3 className="font-bold text-sm">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </div>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function ConnectWalletSection() {
  return (
    <div>
      <SectionTitle>Connect Wallet</SectionTitle>
      <SectionDesc>WOLFDEX supports multiple wallet providers for connecting to LitVM LiteForge Testnet.</SectionDesc>
      <h2 className="text-lg font-bold mb-3">Supported Wallets</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {[
          { name: 'MetaMask', icon: '🦊', desc: 'Most popular browser wallet' },
          { name: 'OKX Wallet', icon: '⭕', desc: 'Multi-chain wallet by OKX' },
          { name: 'Rabby Wallet', icon: '🐰', desc: 'Security-focused wallet' },
          { name: 'Bitget Wallet', icon: '🅱️', desc: 'Wallet by Bitget exchange' },
        ].map(w => (
          <DocCard key={w.name}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{w.icon}</span>
              <div>
                <h3 className="font-bold text-sm">{w.name}</h3>
                <p className="text-xs text-muted-foreground">{w.desc}</p>
              </div>
            </div>
          </DocCard>
        ))}
      </div>
      <h2 className="text-lg font-bold mb-3">How to Connect</h2>
      <StepList steps={[
        'Click "Connect Wallet" button in the top-right corner',
        'Select your preferred wallet from the modal',
        'Approve the connection request in your wallet',
        'WOLFDEX will automatically switch to LitVM LiteForge network (Chain ID: 4441)',
        'Your address and zkLTC balance will appear in the header',
      ]} />
      <Tip>If the network isn't added automatically, WOLFDEX will prompt you to add LitVM LiteForge with the correct RPC settings.</Tip>
    </div>
  );
}

function GetTestnetTokensSection() {
  return (
    <div>
      <SectionTitle>Get Testnet Tokens</SectionTitle>
      <SectionDesc>You need zkLTC (native gas token) to interact with WOLFDEX on the testnet.</SectionDesc>
      <StepList steps={[
        'Ensure your wallet is connected to LitVM LiteForge Testnet',
        'Visit the LitVM LiteForge faucet to request free zkLTC',
        'Enter your wallet address and request tokens',
        'Wait for the transaction to confirm (usually < 30 seconds)',
        'Your zkLTC balance will update in the WOLFDEX header',
      ]} />
      <DocCard>
        <h3 className="font-bold text-sm mb-2">Network Details</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Chain Name</span><span className="font-mono">{CHAIN_CONFIG.chainName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Chain ID</span><span className="font-mono">{CHAIN_CONFIG.chainId}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">RPC URL</span><span className="font-mono text-xs break-all">{CHAIN_CONFIG.rpcUrl}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Symbol</span><span className="font-mono">{CHAIN_CONFIG.symbol}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Explorer</span><a href={CHAIN_CONFIG.blockExplorer} target="_blank" rel="noopener" className="text-wolf-cyan hover:underline text-xs">{CHAIN_CONFIG.blockExplorer}</a></div>
        </div>
      </DocCard>
    </div>
  );
}

function HowToSwapSection() {
  return (
    <div>
      <SectionTitle>How to Swap</SectionTitle>
      <SectionDesc>Swap tokens instantly using WOLFDEX's automated market maker (AMM).</SectionDesc>
      <StepList steps={[
        'Navigate to the Swap page (default home page)',
        'Select the token you want to swap FROM (top input)',
        'Select the token you want to swap TO (bottom input)',
        'Enter the amount — the output will be calculated automatically',
        'Review the trade details: price impact, minimum received, gas estimate',
        'Click "Swap" and confirm the transaction in your wallet',
        'Wait for confirmation — a toast notification will appear with the tx hash',
      ]} />
      <h2 className="text-lg font-bold mb-3">Quick Amount Buttons</h2>
      <p className="text-sm text-muted-foreground mb-4">Use 25%, 50%, 75%, or MAX buttons to quickly set your input amount based on your current balance.</p>
      <h2 className="text-lg font-bold mb-3">Wrap / Unwrap</h2>
      <p className="text-sm text-muted-foreground mb-4">Swapping between zkLTC and wzkLTC is a direct wrap/unwrap operation with no slippage — it's a 1:1 conversion.</p>
      <Tip>Always check the price impact before confirming a large swap. High impact means you'll get fewer tokens than expected.</Tip>
    </div>
  );
}

function ProvideLiquiditySection() {
  return (
    <div>
      <SectionTitle>Provide Liquidity</SectionTitle>
      <SectionDesc>Earn 0.3% trading fees by providing liquidity to token pools.</SectionDesc>
      <h2 className="text-lg font-bold mb-3">Add Liquidity</h2>
      <StepList steps={[
        'Go to the Liquidity page',
        'Select the token pair you want to provide liquidity for',
        'Enter the amount for Token A — Token B will auto-calculate based on the pool ratio',
        'Click "Add Liquidity" and approve token spending if needed',
        'Confirm the transaction in your wallet',
        'You\'ll receive LP tokens representing your pool share',
      ]} />
      <h2 className="text-lg font-bold mb-3">Remove Liquidity</h2>
      <StepList steps={[
        'On the Liquidity page, view your active positions',
        'Enter the amount of LP tokens to remove',
        'Click "Remove Liquidity" and confirm',
        'You\'ll receive both tokens back proportional to your share',
      ]} />
      <Tip>Providing liquidity earns you 0.3% of all trades in that pool, proportional to your share. But beware of impermanent loss!</Tip>
    </div>
  );
}

function PortfolioSendSection() {
  return (
    <div>
      <SectionTitle>Portfolio & Send</SectionTitle>
      <SectionDesc>Track your token holdings, LP positions, and total portfolio value.</SectionDesc>
      <h2 className="text-lg font-bold mb-3">Portfolio Features</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {[
          { title: 'Token Balances', desc: 'View all your token holdings with real-time values' },
          { title: 'LP Positions', desc: 'Track your liquidity pool shares and earned fees' },
          { title: 'Allocation Chart', desc: 'Pie chart showing your asset distribution' },
          { title: 'Value History', desc: 'Track your portfolio value over time' },
        ].map(f => (
          <DocCard key={f.title}>
            <h3 className="font-bold text-sm">{f.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPairsSection() {
  return (
    <div>
      <SectionTitle>Analytics & Pairs</SectionTitle>
      <SectionDesc>Monitor real-time DEX metrics including TVL, volume, and pair performance.</SectionDesc>
      <h2 className="text-lg font-bold mb-3">Available Metrics</h2>
      <div className="space-y-2 mb-6">
        {[
          { label: 'Total Value Locked (TVL)', desc: 'Total liquidity across all pools' },
          { label: '24h Trading Volume', desc: 'Total swap volume in the last 24 hours' },
          { label: 'Total Pairs', desc: 'Number of active trading pairs' },
          { label: 'Total Transactions', desc: 'Cumulative swap count' },
        ].map(m => (
          <DocCard key={m.label}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-sm">{m.label}</h3>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function AmmPricingSection() {
  return (
    <div>
      <SectionTitle>AMM & Pricing</SectionTitle>
      <SectionDesc>WOLFDEX uses the constant product formula (x * y = k) for automated market making.</SectionDesc>
      <DocCard>
        <h3 className="font-bold mb-2">Constant Product Formula</h3>
        <div className="bg-wolf-dark rounded-lg p-4 font-mono text-sm text-wolf-cyan mb-3">x × y = k</div>
        <p className="text-sm text-muted-foreground">Where <strong>x</strong> and <strong>y</strong> are the reserves of each token in the pool, and <strong>k</strong> is a constant. When you swap token A for token B, you add A to the pool and remove B, maintaining the invariant.</p>
      </DocCard>
      <DocCard>
        <h3 className="font-bold mb-2">Price Determination</h3>
        <p className="text-sm text-muted-foreground mb-2">The price of a token is determined by the ratio of reserves in the pool:</p>
        <div className="bg-wolf-dark rounded-lg p-4 font-mono text-sm text-wolf-cyan">Price(A/B) = Reserve(B) / Reserve(A)</div>
      </DocCard>
      <DocCard>
        <h3 className="font-bold mb-2">Trading Fee</h3>
        <p className="text-sm text-muted-foreground">A <span className="text-wolf-gold font-bold">0.3%</span> fee is charged on every swap. This fee goes entirely to liquidity providers, proportional to their pool share.</p>
      </DocCard>
    </div>
  );
}

function ImpermanentLossSection() {
  return (
    <div>
      <SectionTitle>Impermanent Loss</SectionTitle>
      <SectionDesc>Understanding the risk of providing liquidity when token prices change.</SectionDesc>
      <DocCard>
        <h3 className="font-bold mb-2">What is Impermanent Loss?</h3>
        <p className="text-sm text-muted-foreground mb-3">When you provide liquidity, the AMM rebalances your position as prices change. If the price ratio diverges significantly from when you deposited, you could end up with less value than simply holding the tokens.</p>
        <h3 className="font-bold mb-2">Example</h3>
        <p className="text-sm text-muted-foreground">If you deposit equal value of Token A and Token B, and Token A doubles in price, you'll have more Token B and less Token A than you started with. The total value will be less than if you had just held both tokens.</p>
      </DocCard>
      <DocCard>
        <h3 className="font-bold mb-2">IL by Price Change</h3>
        <div className="space-y-2 text-sm">
          {[
            { change: '1.25x', loss: '0.6%' },
            { change: '1.50x', loss: '2.0%' },
            { change: '1.75x', loss: '3.8%' },
            { change: '2x', loss: '5.7%' },
            { change: '3x', loss: '13.4%' },
            { change: '5x', loss: '25.5%' },
          ].map(r => (
            <div key={r.change} className="flex justify-between py-1 border-b border-wolf-border/20 last:border-0">
              <span className="text-muted-foreground">Price change: {r.change}</span>
              <span className="text-destructive font-mono">~{r.loss} IL</span>
            </div>
          ))}
        </div>
      </DocCard>
      <Tip>Impermanent loss becomes "permanent" only when you withdraw. Trading fees earned may offset the loss, especially in high-volume pools.</Tip>
    </div>
  );
}

function SlippageSection() {
  return (
    <div>
      <SectionTitle>Slippage & Price Impact</SectionTitle>
      <SectionDesc>Understanding how trade size affects the price you receive.</SectionDesc>
      <DocCard>
        <h3 className="font-bold mb-2">Slippage Tolerance</h3>
        <p className="text-sm text-muted-foreground mb-2">WOLFDEX uses a default slippage tolerance of <span className="text-wolf-gold font-bold">0.5%</span>. This means your trade will revert if the price moves more than 0.5% against you before execution.</p>
      </DocCard>
      <DocCard>
        <h3 className="font-bold mb-2">Price Impact</h3>
        <p className="text-sm text-muted-foreground mb-2">Price impact is the difference between the market price and the price you'll actually receive. Larger trades relative to pool size have higher price impact.</p>
        <div className="space-y-1.5 text-sm mt-3">
          <div className="flex justify-between"><span className="text-wolf-green">{'< 1%'}</span><span className="text-muted-foreground">Low impact — good trade</span></div>
          <div className="flex justify-between"><span className="text-wolf-gold">1% - 5%</span><span className="text-muted-foreground">Moderate — consider splitting</span></div>
          <div className="flex justify-between"><span className="text-destructive">{'> 5%'}</span><span className="text-muted-foreground">High impact — significant loss</span></div>
        </div>
      </DocCard>
    </div>
  );
}

function LpTokensSection() {
  return (
    <div>
      <SectionTitle>LP Tokens & Fees</SectionTitle>
      <SectionDesc>How liquidity provider tokens work and how you earn fees.</SectionDesc>
      <DocCard>
        <h3 className="font-bold mb-2">What are LP Tokens?</h3>
        <p className="text-sm text-muted-foreground">When you add liquidity, you receive LP (Liquidity Provider) tokens that represent your share of the pool. These tokens are ERC-20 compatible and can be transferred or used in other DeFi protocols.</p>
      </DocCard>
      <DocCard>
        <h3 className="font-bold mb-2">Fee Distribution</h3>
        <p className="text-sm text-muted-foreground mb-2">Every swap pays a <span className="text-wolf-gold font-bold">0.3%</span> fee that is added directly to the pool reserves. As an LP, your share of the pool grows automatically:</p>
        <div className="bg-wolf-dark rounded-lg p-4 font-mono text-sm text-wolf-cyan">Your Fee = (Your LP / Total LP) × 0.3% × Trade Volume</div>
      </DocCard>
      <Tip>Fees are compounded automatically — they increase the pool reserves, which means your LP tokens are worth more over time.</Tip>
    </div>
  );
}

function TechStackSection() {
  return (
    <div>
      <SectionTitle>Technology Stack</SectionTitle>
      <SectionDesc>The technical infrastructure powering WOLFDEX.</SectionDesc>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { title: 'Smart Contracts', desc: 'UniswapV2 (Solidity) — Factory, Router, Library, WETH9, Multicall' },
          { title: 'Blockchain', desc: 'LitVM LiteForge Testnet (Chain ID: 4441, EVM-compatible)' },
          { title: 'Frontend', desc: 'React 19 + TanStack Start + Vite 7 + TypeScript' },
          { title: 'Web3', desc: 'ethers.js v5 for wallet connection and contract interactions' },
          { title: 'Styling', desc: 'Tailwind CSS v4 + Framer Motion animations' },
          { title: 'Charts', desc: 'Recharts for analytics and portfolio visualization' },
        ].map(t => (
          <DocCard key={t.title}>
            <h3 className="font-bold text-sm">{t.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function SmartContractsSection() {
  return (
    <div>
      <SectionTitle>Smart Contracts</SectionTitle>
      <SectionDesc>All deployed and verified contracts on LitVM LiteForge Testnet.</SectionDesc>
      <div className="space-y-3">
        {[
          { name: 'Factory', addr: CONTRACTS.FACTORY, desc: 'Creates and manages trading pairs', tag: 'Core' },
          { name: 'Router', addr: CONTRACTS.ROUTER, desc: 'Handles swaps, liquidity add/remove with safety checks', tag: 'Core' },
          { name: 'WETH9 (wzkLTC)', addr: CONTRACTS.WETH, desc: 'Wrapped native token for AMM compatibility', tag: 'Core' },
          { name: 'Library', addr: CONTRACTS.LIBRARY, desc: 'Helper functions for price calculations', tag: 'Core' },
          { name: 'Multicall', addr: CONTRACTS.MULTICALL, desc: 'Batch multiple read calls in one transaction', tag: 'Core' },
          { name: 'Farming', addr: CONTRACTS.FARMING, desc: 'Stake LP tokens to earn WDEX emissions across multiple pools', tag: 'Yield' },
          { name: 'Casino', addr: CONTRACTS.CASINO, desc: 'On-chain provably-fair casino: Coinflip, Slot, Plinko, RPS, VideoPoker, Roulette, Lucky Wheel, Spin to Win', tag: 'GameFi' },
          { name: 'Limit Order Book', addr: CONTRACTS.LIMIT_ORDER, desc: 'Signed on-chain limit orders settled by makers and takers', tag: 'Core' },
          { name: 'Faucet', addr: CONTRACTS.FAUCET, desc: 'Multi-token testnet faucet with cooldown and max-claims', tag: 'Core' },
          { name: 'Launchpad', addr: CONTRACTS.LAUNCHPAD, desc: 'Deploy your own ERC20 token via createToken()', tag: 'Core' },
          { name: 'DNS Registry', addr: CONTRACTS.DNS_REGISTRY, desc: `Root ownership + resolver mapping for the .${DNS_TLD} namespace`, tag: 'DNS' },
          { name: 'DNS Base Registrar', addr: CONTRACTS.DNS_BASE_REGISTRAR, desc: `ERC-721 NFT contract that mints .${DNS_TLD} domain tokens`, tag: 'DNS' },
          { name: 'DNS Controller', addr: CONTRACTS.DNS_CONTROLLER, desc: 'Commit/reveal registration, renewals, pricing and availability', tag: 'DNS' },
          { name: 'DNS Resolver', addr: CONTRACTS.DNS_RESOLVER, desc: 'Forward + reverse resolution — pin a primary domain per wallet', tag: 'DNS' },
        ].map(c => (
          <DocCard key={c.name}>
            <div className="flex justify-between items-start mb-1 gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm">{c.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  c.tag === 'GameFi' ? 'bg-wolf-pink/15 text-wolf-pink border-wolf-pink/30'
                  : c.tag === 'Yield' ? 'bg-wolf-green/15 text-wolf-green border-wolf-green/30'
                  : c.tag === 'DNS' ? 'bg-wolf-gold/15 text-wolf-gold border-wolf-gold/30'
                  : 'bg-wolf-cyan/15 text-wolf-cyan border-wolf-cyan/30'
                }`}>{c.tag}</span>
              </div>
              <a href={`${CHAIN_CONFIG.blockExplorer}/address/${c.addr}`} target="_blank" rel="noopener" className="text-wolf-cyan text-xs hover:underline shrink-0">View ↗</a>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{c.desc}</p>
            <code className="text-xs font-mono text-wolf-gold bg-wolf-dark px-2 py-1 rounded break-all block">{c.addr}</code>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function SupportedTokensSection() {
  return (
    <div>
      <SectionTitle>Supported Tokens</SectionTitle>
      <SectionDesc>All tokens available for trading on WOLFDEX.</SectionDesc>
      <div className="space-y-2">
        {TOKENS.map(t => (
          <DocCard key={t.symbol}>
            <div className="flex items-center gap-3">
              <img src={t.logo} alt={t.symbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">{t.symbol}</h3>
                  <span className="text-xs text-muted-foreground">{t.name}</span>
                  {t.isNative && <span className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-gold/20 text-wolf-gold border border-wolf-gold/30">Native</span>}
                </div>
                <code className="text-xs font-mono text-muted-foreground break-all">{t.address}</code>
              </div>
            </div>
          </DocCard>
        ))}
      </div>
    </div>
  );
}

function RoadmapSection() {
  const completedCount = ROADMAP.filter(p => p.status === 'completed').length;
  const inProgressCount = ROADMAP.filter(p => p.status === 'in-progress').length;
  const totalProgress = Math.round(
    ROADMAP.reduce((acc, p) => acc + (p.progress ?? 0), 0) / ROADMAP.length
  );

  return (
    <div>
      <SectionTitle>Development Roadmap</SectionTitle>
      <SectionDesc>
        The WolfDex journey from foundation to a full institutional-grade DEX protocol — V2 core, V3 concentrated liquidity, perpetuals, cross-chain and decentralized governance.
      </SectionDesc>

      {/* Top summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <DocCard className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Phases</div>
          <div className="text-2xl font-black wolf-gradient-text">{ROADMAP.length}</div>
        </DocCard>
        <DocCard className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Completed</div>
          <div className="text-2xl font-black text-wolf-green">{completedCount}</div>
        </DocCard>
        <DocCard className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">In Progress</div>
          <div className="text-2xl font-black text-wolf-gold">{inProgressCount}</div>
        </DocCard>
        <DocCard className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Overall</div>
          <div className="text-2xl font-black wolf-gradient-text">{totalProgress}%</div>
        </DocCard>
      </div>

      {/* Overall progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
          <span>Protocol maturity</span>
          <span className="font-mono">{totalProgress}% / 100%</span>
        </div>
        <div className="h-2 rounded-full bg-wolf-surface overflow-hidden border border-wolf-border/30">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-wolf-green via-wolf-gold to-wolf-pink rounded-full shadow-[0_0_15px] shadow-wolf-pink/40"
          />
        </div>
      </div>

      <div className="relative">
        {/* Timeline gradient line */}
        <div className="absolute left-[19px] top-4 bottom-4 w-px bg-gradient-to-b from-wolf-green via-wolf-gold to-wolf-purple/30 hidden sm:block" />

        <div className="space-y-5">
          {ROADMAP.map((phase, i) => {
            const isDone = phase.status === 'completed';
            const isLive = phase.status === 'in-progress';
            const dotColor = isDone ? 'bg-wolf-green shadow-wolf-green/60'
              : isLive ? 'bg-wolf-gold shadow-wolf-gold/60 animate-pulse'
              : 'bg-wolf-surface border-wolf-purple/40';

            return (
              <motion.div
                key={phase.phase}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: Math.min(i * 0.06, 0.4), duration: 0.4 }}
                className="relative sm:pl-14"
              >
                {/* Timeline dot with glow ring */}
                <div className="hidden sm:block absolute left-[12px] top-5">
                  <div className={`relative w-4 h-4 rounded-full border-2 ${dotColor} ${isLive ? 'shadow-[0_0_18px]' : isDone ? 'shadow-[0_0_12px]' : ''}`} >
                    {isLive && (
                      <span className="absolute inset-0 rounded-full bg-wolf-gold/40 animate-ping" />
                    )}
                  </div>
                </div>

                <DocCard className={`wolf-card-hover transition-all relative overflow-hidden ${
                  isLive ? 'ring-1 ring-wolf-gold/30' : ''
                }`}>
                  {/* Decorative corner gradient */}
                  <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none ${
                    isDone ? 'bg-wolf-green' : isLive ? 'bg-wolf-gold' : 'bg-wolf-purple'
                  }`} />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{phase.phase}</span>
                          <span className="opacity-30">·</span>
                          <span className="text-[10px] font-bold text-wolf-pink uppercase tracking-widest">Phase {i + 1}</span>
                        </div>
                        <h3 className="text-lg sm:text-xl font-black wolf-gradient-text leading-tight">{phase.title}</h3>
                        {phase.summary && (
                          <p className="text-xs text-muted-foreground mt-1 max-w-xl">{phase.summary}</p>
                        )}
                      </div>
                      <StatusBadge status={phase.status} />
                    </div>

                    {/* Per-phase progress bar */}
                    {typeof phase.progress === 'number' && phase.progress > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span className="font-mono">{phase.progress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-wolf-surface overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            whileInView={{ width: `${phase.progress}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }}
                            className={`h-full rounded-full ${
                              isDone ? 'bg-wolf-green' : isLive ? 'bg-gradient-to-r from-wolf-gold to-wolf-pink' : 'bg-wolf-purple/40'
                            }`}
                          />
                        </div>
                      </div>
                    )}

                    <ul className="space-y-2 mt-2">
                      {phase.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            isDone ? 'bg-wolf-green' : isLive ? 'bg-wolf-gold' : 'bg-wolf-border'
                          }`} />
                          <span className={isDone ? 'text-foreground/65' : 'text-foreground/90'}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </DocCard>
              </motion.div>
            );
          })}
        </div>
      </div>

      <Tip>
        Roadmap is a living document — community proposals via veWDEX governance can re-prioritize milestones once the token is live.
      </Tip>
    </div>
  );
}

function FaqSection() {
  const faqs = [
    { q: 'Is WOLFDEX safe to use?', a: 'WOLFDEX uses battle-tested UniswapV2 contracts. However, this is a testnet deployment — do not use real funds. Always verify contract addresses before interacting.' },
    { q: 'What are the trading fees?', a: '0.3% per swap, distributed entirely to liquidity providers. There are no platform fees.' },
    { q: 'Can I use WOLFDEX on mobile?', a: 'Yes! WOLFDEX is fully responsive. Use any mobile wallet browser (MetaMask, OKX, Rabby, Bitget) to access all features.' },
    { q: 'How do I get zkLTC for gas?', a: 'Use the LitVM LiteForge faucet to get free testnet zkLTC tokens for gas fees.' },
    { q: 'What is the WDEX token?', a: 'WDEX is the native WOLFDEX governance and utility token. It will be used for governance voting, fee sharing, and staking rewards.' },
    { q: 'Why did my swap fail?', a: 'Common reasons: insufficient gas (need more zkLTC), slippage too low (increase tolerance), or price moved too much between estimation and execution.' },
    { q: 'What is wrapping/unwrapping?', a: 'Wrapping converts native zkLTC to ERC-20 wzkLTC (1:1 ratio). This is needed because AMMs require ERC-20 tokens. The router handles this automatically for most swaps.' },
  ];

  return (
    <div>
      <SectionTitle>Frequently Asked Questions</SectionTitle>
      <SectionDesc>Common questions about using WOLFDEX.</SectionDesc>
      <div className="space-y-3">
        {faqs.map((faq, i) => (
          <DocCard key={i}>
            <h3 className="font-bold text-sm mb-2 text-wolf-cyan">{faq.q}</h3>
            <p className="text-sm text-muted-foreground">{faq.a}</p>
          </DocCard>
        ))}
      </div>
    </div>
  );
}
