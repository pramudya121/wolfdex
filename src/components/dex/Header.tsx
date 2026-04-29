import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import wolfLogo from '@/assets/wolf-logo.png';
import type { WalletType } from '@/hooks/useWallet';
import TxHistoryPopover from './TxHistoryPopover';
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
  { path: '/docs', label: 'Docs' },
] as const;

const WALLETS: { type: WalletType; name: string; icon: string }[] = [
  { type: 'metamask', name: 'MetaMask', icon: '🦊' },
  { type: 'okx', name: 'OKX Wallet', icon: '⭕' },
  { type: 'rabby', name: 'Rabby', icon: '🐰' },
  { type: 'bitget', name: 'Bitget', icon: '🅱️' },
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

  // Toast + auto-close modal when connection state flips to connected
  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (!wasConnectedRef.current && isConnected) {
      toast.success(
        `🐺 Wallet connected${address ? ` · ${address.slice(0,6)}…${address.slice(-4)}` : ''}`,
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

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b border-wolf-border/40"
        style={{ background: 'linear-gradient(180deg, oklch(0.1 0.02 20 / 95%), oklch(0.1 0.02 20 / 80%))' }}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img src={wolfLogo} alt="WOLFDEX" className="w-9 h-9 rounded-full ring-2 ring-wolf-red/40 group-hover:ring-wolf-red transition-all group-hover:scale-105 duration-300" />
            <span className="text-xl font-bold wolf-gradient-text-animated hidden sm:block tracking-tight">WOLFDEX</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path;
              return (
                <Link key={item.path} to={item.path}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors relative wolf-focus-ring ${
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {active && (
                    <motion.div layoutId="nav-active"
                      className="absolute inset-0 rounded-lg bg-gradient-to-br from-wolf-red/20 via-wolf-pink/15 to-wolf-gold/10 border border-wolf-red/40 shadow-[0_0_20px_-6px_oklch(0.65_0.25_330_/_60%)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <TxHistoryPopover />
            {isConnected ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-wolf-surface border border-wolf-border/40 text-sm">
                  <span className="text-wolf-gold font-medium">{parseFloat(balance).toFixed(4)}</span>
                  <span className="text-muted-foreground">zkLTC</span>
                </div>
                <button onClick={onDisconnect}
                  className="px-3 py-1.5 rounded-lg bg-wolf-surface border border-wolf-border/40 text-sm font-medium hover:border-wolf-red/50 transition-all flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  {shortAddr}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowWallet(true)}
                disabled={isConnecting}
                className="wolf-btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-80"
              >
                {isConnecting && <WolfSpinner size={14} />}
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
            <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden p-2 text-foreground">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileNav ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileNav && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="md:hidden overflow-hidden border-t border-wolf-border/30">
              <div className="p-3 space-y-1">
                {NAV_ITEMS.map(item => (
                  <Link key={item.path} to={item.path} onClick={() => setMobileNav(false)}
                    className={`block px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                      location.pathname === item.path ? 'bg-wolf-red/15 text-foreground' : 'text-muted-foreground'
                    }`}
                  >{item.label}</Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <AnimatePresence>
        {showWallet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => { if (!isConnecting) setShowWallet(false); }}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="wolf-card rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}
            >
              {isConnecting ? (
                <div className="flex flex-col items-center gap-5 py-6">
                  <WolfSkeletonOrb />
                  <div className="text-center space-y-1">
                    <h3 className="text-base font-bold wolf-gradient-text">
                      Connecting to {pendingWallet ? WALLETS.find(w => w.type === pendingWallet)?.name : 'wallet'}…
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Approve the connection request in your wallet extension.
                    </p>
                  </div>
                  <div className="w-full grid grid-cols-3 gap-2 pt-2">
                    <WolfSkeleton flat className="h-2 rounded-full" />
                    <WolfSkeleton flat className="h-2 rounded-full" />
                    <WolfSkeleton flat className="h-2 rounded-full" />
                  </div>
                </div>
              ) : (
                <>
                  <h3 className="text-lg font-bold mb-1">Connect Wallet</h3>
                  <p className="text-sm text-muted-foreground mb-5">Select your wallet to connect to WOLFDEX</p>
                  <div className="space-y-2">
                    {WALLETS.map(w => (
                      <button key={w.type}
                        onClick={() => handleConnect(w.type)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 hover:border-wolf-red/40 transition-all text-left group"
                      >
                        <span className="text-2xl group-hover:scale-110 transition-transform">{w.icon}</span>
                        <span className="font-medium">{w.name}</span>
                        <span className="ml-auto text-muted-foreground group-hover:text-wolf-red transition-colors">→</span>
                      </button>
                    ))}
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
