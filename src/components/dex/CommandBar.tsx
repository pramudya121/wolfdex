import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from '@tanstack/react-router';
import { TOKENS } from '@/config/contracts';
import { useCustomTokens } from '@/hooks/useCustomTokens';
import { useDexContext } from '@/context/DexContext';
import TokenLogo from './ui/TokenLogo';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: 'Navigate' | 'Tokens' | 'Actions' | 'Wallet';
  icon: string;
  run: () => void;
  keywords?: string;
}

export default function CommandBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { customTokens } = useCustomTokens();
  const { wallet, setShowWalletModal } = useDexContext();

  // Open on ⌘K / Ctrl+K, close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const close = () => setOpen(false);

  const commands: Cmd[] = useMemo(() => {
    const navItems: Array<[string, string, string]> = [
      ['Home', '/', '🏠'],
      ['Swap', '/swap', '🔁'],
      ['Liquidity', '/liquidity', '💧'],
      ['Pools', '/pools', '🌊'],
      ['Farming', '/farming', '🌾'],
      ['Casino', '/casino', '🎰'],
      ['Analytics', '/analytics', '📈'],
      ['Portfolio', '/portfolio', '🐺'],
      ['Docs', '/docs', '📚'],
    ];

    const navCmds: Cmd[] = navItems.map(([label, path, icon]) => ({
      id: `nav-${path}`,
      label: `Go to ${label}`,
      hint: path,
      group: 'Navigate',
      icon,
      run: () => { navigate({ to: path }); close(); },
    }));

    const tokenCmds: Cmd[] = [...TOKENS, ...customTokens].map(t => ({
      id: `tok-${t.address}`,
      label: `Swap into ${t.symbol}`,
      hint: t.name,
      group: 'Tokens',
      icon: '',
      keywords: `${t.symbol} ${t.name} ${t.address}`,
      run: () => { navigate({ to: '/swap', search: { to: t.address } as any }); close(); },
    }));

    const actionCmds: Cmd[] = [
      { id: 'act-import', label: 'Import a custom token', group: 'Actions', icon: '➕', hint: 'paste 0x address', run: () => { navigate({ to: '/swap' }); close(); } },
      { id: 'act-create-pair', label: 'Create new pair', group: 'Actions', icon: '🧪', hint: '/liquidity', run: () => { navigate({ to: '/liquidity' }); close(); } },
      { id: 'act-history', label: 'View transaction history', group: 'Actions', icon: '🧾', hint: '/portfolio', run: () => { navigate({ to: '/portfolio' }); close(); } },
    ];

    const walletCmds: Cmd[] = wallet.isConnected
      ? [
          { id: 'w-disconnect', label: 'Disconnect wallet', group: 'Wallet', icon: '🚪', hint: wallet.address?.slice(0, 10) + '…', run: () => { wallet.disconnect(); close(); } },
          { id: 'w-copy', label: 'Copy wallet address', group: 'Wallet', icon: '📋', hint: wallet.address?.slice(0, 10) + '…', run: () => { if (wallet.address) navigator.clipboard.writeText(wallet.address); close(); } },
        ]
      : [
          { id: 'w-connect', label: 'Connect wallet', group: 'Wallet', icon: '🔌', run: () => { setShowWalletModal(true); close(); } },
        ];

    return [...navCmds, ...actionCmds, ...walletCmds, ...tokenCmds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customTokens, wallet.isConnected, wallet.address]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return commands.slice(0, 24);
    return commands.filter(c =>
      c.label.toLowerCase().includes(query) ||
      (c.hint || '').toLowerCase().includes(query) ||
      (c.keywords || '').toLowerCase().includes(query),
    ).slice(0, 40);
  }, [q, commands]);

  useEffect(() => { setActive(0); }, [q]);

  // Group results
  const grouped = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    filtered.forEach(c => {
      if (!map.has(c.group)) map.set(c.group, []);
      map.get(c.group)!.push(c);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[active]?.run(); }
  };

  // Find token info for token rows
  const tokenLookup = useMemo(() => {
    const m = new Map<string, { addr: string; sym: string; logo?: string }>();
    [...TOKENS, ...customTokens].forEach(t => m.set(`tok-${t.address}`, { addr: t.address, sym: t.symbol, logo: t.logo }));
    return m;
  }, [customTokens]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-3 bg-black/60 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="wolf-card w-full max-w-xl rounded-2xl overflow-hidden shadow-[0_20px_60px_-10px_oklch(0.65_0.25_330_/_30%)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-wolf-border/30">
              <span className="text-muted-foreground">🔎</span>
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search pages, tokens, actions…"
                className="bg-transparent flex-1 outline-none text-sm sm:text-base placeholder:text-muted-foreground/60"
              />
              <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-wolf-surface border border-wolf-border/40 text-[10px] font-mono text-muted-foreground">ESC</kbd>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">No results for "{q}"</div>
              )}
              {grouped.map(([group, items]) => (
                <div key={group} className="py-1">
                  <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">{group}</div>
                  {items.map((c) => {
                    const idx = filtered.indexOf(c);
                    const isActive = idx === active;
                    const tok = tokenLookup.get(c.id);
                    return (
                      <button
                        key={c.id}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => c.run()}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-gradient-to-r from-wolf-red/15 via-wolf-pink/10 to-transparent text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {tok ? (
                          <TokenLogo address={tok.addr} symbol={tok.sym} logo={tok.logo} size={22} />
                        ) : (
                          <span className="text-base w-[22px] text-center">{c.icon}</span>
                        )}
                        <span className="flex-1 truncate">{c.label}</span>
                        {c.hint && <span className="text-[11px] text-muted-foreground/70 truncate max-w-[40%]">{c.hint}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t border-wolf-border/30 text-[10px] text-muted-foreground/70">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 py-0.5 rounded bg-wolf-surface border border-wolf-border/30">↑↓</kbd> navigate</span>
                <span><kbd className="px-1 py-0.5 rounded bg-wolf-surface border border-wolf-border/30">↵</kbd> select</span>
              </div>
              <span className="hidden sm:inline">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
