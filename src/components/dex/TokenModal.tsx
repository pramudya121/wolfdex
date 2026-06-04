import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, type TokenInfo } from '@/config/contracts';
import { useCustomTokens } from '@/hooks/useCustomTokens';
import { useDexContext } from '@/context/DexContext';
import { toast } from 'sonner';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  excludeAddress?: string;
}

export default function TokenModal({ isOpen, onClose, onSelect, excludeAddress }: TokenModalProps) {
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const { customTokens, importToken, removeToken } = useCustomTokens();
  const { wallet, dex } = useDexContext();
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Dedupe by lowercased address — curated TOKENS win over customTokens/registry
  // copies so a token registered in Supabase doesn't appear twice in the picker.
  const allTokens = useMemo(() => {
    const seen = new Set<string>();
    const out: TokenInfo[] = [];
    for (const t of [...TOKENS, ...customTokens]) {
      const key = t.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out;
  }, [customTokens]);

  // Fetch balances for ALL tokens in a single multicall whenever modal opens
  useEffect(() => {
    if (!isOpen || !wallet.address) return;
    let cancelled = false;
    setLoadingBalances(true);
    (async () => {
      try {
        const addrs = allTokens.map(t => t.address);
        const bals = await dex.getMultipleBalances(addrs);
        if (cancelled) return;
        const map: Record<string, string> = {};
        addrs.forEach((a, i) => { map[a.toLowerCase()] = bals[i] || '0'; });
        setBalances(map);
      } catch { /* leave empty */ }
      finally { if (!cancelled) setLoadingBalances(false); }
    })();
    return () => { cancelled = true; };
  }, [isOpen, wallet.address, allTokens, dex]);

  const balanceFor = (addr: string) => parseFloat(balances[addr.toLowerCase()] || '0');

  const trimmed = search.trim();
  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase();
    const list = allTokens.filter(t =>
      t.address !== excludeAddress &&
      (t.symbol.toLowerCase().includes(q) ||
       t.name.toLowerCase().includes(q) ||
       t.address.toLowerCase() === q)
    );
    // Sort by balance desc, then alphabetically
    return list.sort((a, b) => {
      const ba = balanceFor(a.address);
      const bb = balanceFor(b.address);
      if (bb !== ba) return bb - ba;
      return a.symbol.localeCompare(b.symbol);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTokens, trimmed, excludeAddress, balances]);

  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(trimmed);
  const showImport = isAddress && filtered.length === 0;

  const handleImport = async () => {
    setImporting(true);
    try {
      const tok = await importToken(trimmed);
      toast.success(`Imported ${tok.symbol}`, { description: tok.name });
      onSelect(tok); onClose(); setSearch('');
    } catch (e: any) {
      toast.error('Import failed', { description: e.message || 'Could not read token contract' });
    } finally { setImporting(false); }
  };

  const fmtBal = (n: number) => {
    if (n === 0) return '0';
    if (n < 0.0001) return '<0.0001';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="wolf-card rounded-2xl p-5 w-full max-w-md max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Select Token</h3>
                {wallet.address && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-wolf-pink/10 text-wolf-pink border border-wolf-pink/20 uppercase tracking-wider">
                    {loadingBalances ? 'Loading…' : 'Balances live'}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
            </div>
            <input
              type="text" placeholder="Search name, symbol or paste 0x address…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="wolf-input w-full px-4 py-2.5 rounded-xl text-sm mb-4"
            />
            <div className="flex flex-wrap gap-2 mb-4">
              {TOKENS.slice(0, 6).filter(t => t.address !== excludeAddress).map(t => {
                const bal = balanceFor(t.address);
                return (
                  <button key={t.address} onClick={() => { onSelect(t); onClose(); setSearch(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 text-sm transition-all"
                  >
                    <img src={t.logo} alt={t.symbol} className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <span>{t.symbol}</span>
                    {bal > 0 && (
                      <span className="text-[10px] text-wolf-gold font-bold">{fmtBal(bal)}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {showImport && (
              <div className="mb-3 p-3 rounded-xl bg-wolf-pink/10 border border-wolf-pink/30">
                <p className="text-xs text-muted-foreground mb-2">Token not in list — import from address?</p>
                <p className="text-[10px] font-mono break-all text-foreground/70 mb-2">{trimmed}</p>
                <button onClick={handleImport} disabled={importing}
                  className="w-full py-2 rounded-lg wolf-btn-primary text-sm font-semibold disabled:opacity-50"
                >{importing ? 'Importing…' : 'Import Token'}</button>
              </div>
            )}

            <div className="overflow-y-auto flex-1 space-y-1">
              {filtered.map(t => {
                const isCustom = customTokens.some(c => c.address === t.address);
                const bal = balanceFor(t.address);
                return (
                  <div key={t.address} className="group flex items-center gap-2">
                    <button onClick={() => { onSelect(t); onClose(); setSearch(''); }}
                      className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-wolf-surface-hover transition-all text-left"
                    >
                      <img src={t.logo} alt={t.symbol} className="w-8 h-8 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          {t.symbol}
                          {isCustom && <span className="text-[9px] px-1.5 py-0.5 rounded bg-wolf-purple/20 text-wolf-purple uppercase tracking-wider">Custom</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold tabular-nums ${bal > 0 ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                          {fmtBal(bal)}
                        </div>
                        {bal > 0 && (
                          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">balance</div>
                        )}
                      </div>
                    </button>
                    {isCustom && (
                      <button onClick={() => removeToken(t.address)}
                        className="px-2 py-1 text-xs text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      >Remove</button>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && !showImport && <p className="text-center text-muted-foreground py-8 text-sm">No tokens found</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
