import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TOKENS, type TokenInfo } from '@/config/contracts';
import { useCustomTokens } from '@/hooks/useCustomTokens';
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

  const allTokens = [...TOKENS, ...customTokens];
  const trimmed = search.trim();
  const filtered = allTokens.filter(t =>
    t.address !== excludeAddress &&
    (t.symbol.toLowerCase().includes(trimmed.toLowerCase()) ||
     t.name.toLowerCase().includes(trimmed.toLowerCase()) ||
     t.address.toLowerCase() === trimmed.toLowerCase())
  );

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
              <h3 className="text-lg font-bold">Select Token</h3>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
            </div>
            <input
              type="text" placeholder="Search name, symbol or paste 0x address…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="wolf-input w-full px-4 py-2.5 rounded-xl text-sm mb-4"
            />
            <div className="flex flex-wrap gap-2 mb-4">
              {TOKENS.slice(0, 6).filter(t => t.address !== excludeAddress).map(t => (
                <button key={t.address} onClick={() => { onSelect(t); onClose(); setSearch(''); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 text-sm transition-all"
                >
                  <img src={t.logo} alt={t.symbol} className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  {t.symbol}
                </button>
              ))}
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
