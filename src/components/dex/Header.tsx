import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import wolfLogo from '@/assets/wolf-logo.png';
import type { WalletType } from '@/hooks/useWallet';

import { WolfSkeleton, WolfSkeletonOrb, WolfSpinner } from './ui/WolfSkeleton';

const NAV_ITEMS = [
  { path: '/', label: 'Home' },
  { path: '/swap', label: 'Swap' },
  { path: '/liquidity', label: 'Liquidity' },
  { path: '/pools', label: 'Pools' },
  { path: '/farming', label: 'Farming' },
  { path: '/casino', label: 'Casino' },
  { path: '/analytics', label: 'Analytics' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/faucet', label: 'Faucet' },
  { path: '/launchpad', label: 'Launchpad' },
  { path: '/domains', label: 'Domains' },
  { path: '/docs', label: 'Docs' },
] as const;

const WALLETS: { type: WalletType; name: string; icon: string; badge: string }[] = [
  { type: 'rabby', name: 'Rabby Wallet', icon: 'https://rabby.io/assets/images/logo-128.png', badge: 'Installed' },
  { type: 'metamask', name: 'MetaMask', icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg', badge: 'Installed' },
  { type: 'okx', name: 'OKX Wallet', icon: 'https://www.okx.com/cdn/assets/imgs/239/9CC4DC1572DCAFAE.png', badge: 'Popular' },
  { type: 'bitget', name: 'Bitget Wallet', icon: 'https://img.bitgetimg.com/multiLang/web/8a4cd2c9b8b9b1c0a2f0e2c8b8b9b1c0.png', badge: 'Popular' },
];

interface HeaderProps {
  address: string | null;
  balance: string;
  isConnected: boolean;
  isConnecting?: boolean;
  onConnect: (type: WalletType) => void | Promise<void>;
  onDisconnect: () => void;
}

export default function Header({ address, balance, isConnected, isConnecting = false, onConnect, onDisconnect }: HeaderProps) {
  const location = useLocation();
  const [showWallet, setShowWallet] = useState(false);
  const [pendingWallet, setPendingWallet] = useState<WalletType | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  const shortAddr = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  const installedWallets = WALLETS.filter(wallet => wallet.badge === 'Installed');
  const popularWallets = WALLETS.filter(wallet => wallet.badge === 'Popular');

  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (!wasConnectedRef.current && isConnected) {
      toast.success(
        `🐺 Wallet connected${address ? ` · ${address.slice(0, 6)}…${address.slice(-4)}` : ''}`,
        { description: 'You are now connected to LitVM LiteForge.' }
      );
      setShowWallet(false);
      setPendingWallet(null);
    }
    if (wasConnectedRef.current && !isConnected) {
      toast.message('Wallet disconnected');
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected, address]);

  const handleConnect = async (type: WalletType) => {
    setPendingWallet(type);
    try {
      await onConnect(type);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to connect wallet');
      setPendingWallet(null);
    }
  };

  const WalletList = ({ items }: { items: typeof WALLETS }) => (
    <div className="space-y-2">
      {items.map(wallet => (
        <button
          key={wallet.type}
          onClick={() => handleConnect(wallet.type)}
          className="group flex w-full items-center gap-3 rounded-2xl border border-wolf-border/30 bg-wolf-surface/50 px-3 py-3 text-left transition-all hover:border-wolf-red/40 hover:bg-wolf-surface"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-wolf-border/30 bg-background/60 overflow-hidden transition-transform group-hover:scale-105">
            <img
              src={wallet.icon}
              alt={wallet.name}
              className="h-7 w-7 object-contain"
              loading="lazy"
              onError={(e) => {
                const fallback = wallet.name.charAt(0);
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const parent = (e.currentTarget as HTMLImageElement).parentElement;
                if (parent && !parent.querySelector('.wallet-fallback')) {
                  const span = document.createElement('span');
                  span.className = 'wallet-fallback text-base font-bold';
                  span.textContent = fallback;
                  parent.appendChild(span);
                }
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{wallet.name}</div>
            <div className="text-[11px] text-muted-foreground">EVM compatible</div>
          </div>
          <span className="text-muted-foreground transition-colors group-hover:text-wolf-red">→</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 border-b border-wolf-border/40 backdrop-blur-xl"
        style={{ background: 'linear-gradient(180deg, oklch(0.1 0.02 20 / 95%), oklch(0.1 0.02 20 / 80%))' }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/" className="group flex min-w-0 shrink items-center gap-2 overflow-hidden whitespace-nowrap">
            <img src={wolfLogo} alt="WOLFDEX" className="h-8 w-8 shrink-0 rounded-full ring-2 ring-wolf-red/40 transition-all duration-300 group-hover:scale-105 group-hover:ring-wolf-red" />
            <span className="hidden shrink-0 whitespace-nowrap text-base font-bold tracking-tight wolf-gradient-text-animated sm:block min-[1180px]:text-lg">
              WOLFDEX
            </span>
          </Link>

          <nav className="hidden min-[1180px]:flex min-w-0 flex-1 items-center justify-center gap-0.5 px-2">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors wolf-focus-ring ${
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-lg border border-wolf-red/40 bg-gradient-to-br from-wolf-red/20 via-wolf-pink/15 to-wolf-gold/10 shadow-[0_0_20px_-6px_oklch(0.65_0.25_330_/_60%)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 whitespace-nowrap">
            {isConnected ? (
              <div className="flex items-center gap-1.5">
                <div className="hidden min-[1180px]:flex items-center gap-1 rounded-lg border border-wolf-border/40 bg-wolf-surface px-2.5 py-1.5 text-xs whitespace-nowrap">
                  <span className="font-medium text-wolf-gold">{parseFloat(balance).toFixed(2)}</span>
                  <span className="text-muted-foreground">zkLTC</span>
                </div>
                <button
                  onClick={onDisconnect}
                  className="flex items-center gap-1.5 rounded-lg border border-wolf-border/40 bg-wolf-surface px-2.5 py-1.5 text-xs font-medium transition-all hover:border-wolf-red/50 whitespace-nowrap"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  {shortAddr}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowWallet(true)}
                disabled={isConnecting}
                className="wolf-btn-primary flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-80 sm:px-4"
              >
                {isConnecting && <WolfSpinner size={14} />}
                <span className="hidden min-[420px]:inline">{isConnecting ? 'Connecting…' : 'Connect Wallet'}</span>
                <span className="min-[420px]:hidden">Wallet</span>
              </button>
            )}
            <button onClick={() => setMobileNav(!mobileNav)} className="p-2 text-foreground min-[1180px]:hidden" aria-label="Toggle navigation">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileNav ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileNav && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-wolf-border/30 min-[1180px]:hidden"
            >
              <div className="p-3 space-y-3">
                {isConnected && (
                  <div className="flex items-center justify-between rounded-xl border border-wolf-border/40 bg-wolf-surface/60 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      {shortAddr}
                    </span>
                    <span className="font-semibold text-wolf-gold">{parseFloat(balance).toFixed(3)} zkLTC</span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {NAV_ITEMS.map(item => {
                    const active = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileNav(false)}
                        className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all wolf-focus-ring ${
                          active
                            ? 'border border-wolf-red/40 bg-gradient-to-br from-wolf-red/20 via-wolf-pink/15 to-wolf-gold/10 text-foreground'
                            : 'border border-wolf-border/30 bg-wolf-surface/40 text-muted-foreground hover:text-foreground hover:border-wolf-pink/40'
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.header>

      <AnimatePresence>
        {showWallet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
            onClick={() => { if (!isConnecting) setShowWallet(false); }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="relative grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-wolf-border/40 bg-background shadow-2xl md:grid-cols-[320px_1fr]"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => !isConnecting && setShowWallet(false)}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-wolf-border/40 bg-background/70 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                aria-label="Close wallet modal"
                disabled={isConnecting}
              >
                ✕
              </button>

              {isConnecting ? (
                <div className="col-span-full flex flex-col items-center gap-5 px-6 py-12">
                  <WolfSkeletonOrb />
                  <div className="space-y-1 text-center">
                    <h3 className="text-base font-bold wolf-gradient-text">
                      Connecting to {pendingWallet ? WALLETS.find(w => w.type === pendingWallet)?.name : 'wallet'}…
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Approve the connection request in your wallet extension.
                    </p>
                  </div>
                  <div className="grid w-full max-w-sm grid-cols-3 gap-2 pt-2">
                    <WolfSkeleton flat className="h-2 rounded-full" />
                    <WolfSkeleton flat className="h-2 rounded-full" />
                    <WolfSkeleton flat className="h-2 rounded-full" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-b border-wolf-border/30 p-6 md:border-b-0 md:border-r">
                    <div className="mb-6">
                      <h3 className="text-[28px] font-black leading-none text-foreground">Connect Wallet</h3>
                      <p className="mt-2 text-sm text-muted-foreground">Choose a wallet to connect to WolfDex.</p>
                    </div>

                    <div className="space-y-5">
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-wolf-pink">Installed</div>
                        <WalletList items={installedWallets} />
                      </div>
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Popular</div>
                        <WalletList items={popularWallets} />
                      </div>
                    </div>
                  </div>

                  <div className="relative flex flex-col justify-between bg-gradient-to-br from-background via-wolf-surface/40 to-background p-6 md:p-8">
                    <div className="space-y-6 pr-10">
                      <div>
                        <h4 className="text-3xl font-black leading-tight text-foreground">What is a wallet?</h4>
                        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                          A wallet is your secure home for digital assets. It lets you connect, sign transactions, create tokens, and manage liquidity on-chain.
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-wolf-border/30 bg-wolf-surface/40 p-4">
                          <div className="mb-2 text-2xl">🔐</div>
                          <div className="text-base font-semibold text-foreground">Secure access</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Approve actions directly in your wallet instead of creating another password.
                          </p>
                        </div>
                        <div className="rounded-2xl border border-wolf-border/30 bg-wolf-surface/40 p-4">
                          <div className="mb-2 text-2xl">⚡</div>
                          <div className="text-base font-semibold text-foreground">Faster onboarding</div>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            Connect once and move straight into swap, launchpad, pools, and faucet flows.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleConnect(installedWallets[0]?.type || WALLETS[0].type)}
                        className="wolf-btn-primary rounded-2xl px-5 py-3 text-sm font-bold"
                      >
                        Connect recommended wallet
                      </button>
                      <a
                        href="https://ethereum.org/en/wallets/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-wolf-pink transition-colors hover:text-foreground"
                      >
                        Learn more
                      </a>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
