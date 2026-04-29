import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { toast } from 'sonner';
import { TOKENS, NATIVE_TOKEN, CHAIN_CONFIG, isNativeToken, type TokenInfo } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';
import { useDexContext } from '@/context/DexContext';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional: prefill the token */
  initialToken?: TokenInfo;
}

export default function SendTokenModal({ open, onClose, initialToken }: Props) {
  const { wallet, txHistory } = useDexContext();
  const [token, setToken] = useState<TokenInfo>(initialToken ?? NATIVE_TOKEN);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('0');
  const [busy, setBusy] = useState(false);
  const [showTokenList, setShowTokenList] = useState(false);

  useEffect(() => { if (initialToken) setToken(initialToken); }, [initialToken]);

  // Live balance
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!wallet.address || !wallet.signer) { setBalance('0'); return; }
      try {
        if (isNativeToken(token.address)) {
          const bal = await wallet.signer.provider!.getBalance(wallet.address);
          if (!cancelled) setBalance(ethers.utils.formatUnits(bal, token.decimals));
        } else {
          const erc = new ethers.Contract(token.address, ERC20_ABI, wallet.signer);
          const bal = await erc.balanceOf(wallet.address);
          if (!cancelled) setBalance(ethers.utils.formatUnits(bal, token.decimals));
        }
      } catch { if (!cancelled) setBalance('0'); }
    }
    if (open) load();
    return () => { cancelled = true; };
  }, [open, token, wallet.address, wallet.signer]);

  const validAddress = useMemo(() => {
    try { return ethers.utils.getAddress(recipient).length === 42; } catch { return false; }
  }, [recipient]);

  const amountNum = parseFloat(amount || '0');
  const balNum = parseFloat(balance || '0');
  const overBalance = amountNum > balNum;
  const sameAsSender = validAddress && wallet.address && recipient.toLowerCase() === wallet.address.toLowerCase();

  const send = async () => {
    if (!wallet.signer || !wallet.address) { toast.error('Connect wallet first'); return; }
    if (!validAddress) { toast.error('Invalid recipient address'); return; }
    if (amountNum <= 0 || overBalance) { toast.error('Invalid amount'); return; }
    setBusy(true);
    const pendingId = `pending-send-${Date.now()}`;
    txHistory.add({
      hash: pendingId, kind: 'send', status: 'pending',
      summary: `Send ${amount} ${token.symbol} → ${recipient.slice(0, 6)}…${recipient.slice(-4)}`,
      account: wallet.address, chainId: CHAIN_CONFIG.chainId,
    });
    const t = toast.loading('Sending…');
    try {
      let tx: ethers.providers.TransactionResponse;
      const parsed = ethers.utils.parseUnits(amount, token.decimals);
      if (isNativeToken(token.address)) {
        tx = await wallet.signer.sendTransaction({ to: recipient, value: parsed });
      } else {
        const erc = new ethers.Contract(token.address, ERC20_ABI, wallet.signer);
        tx = await erc.transfer(recipient, parsed);
      }
      txHistory.update(pendingId, { hash: tx.hash, status: 'pending', summary: `Send ${amount} ${token.symbol}` });
      toast.loading(`Confirming on chain…`, { id: t });
      await tx.wait();
      txHistory.update(pendingId, { hash: tx.hash, status: 'success' });
      toast.success(`Sent ${amount} ${token.symbol}`, {
        id: t,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${tx.hash}`, '_blank') },
      });
      setAmount(''); setRecipient('');
      onClose();
    } catch (e: any) {
      txHistory.update(pendingId, { status: 'failed' });
      toast.error('Send failed', { id: t, description: (e.reason || e.message || '').slice(0, 120) });
    } finally { setBusy(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="wolf-card rounded-2xl p-6 w-full max-w-md relative overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Glow */}
            <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-wolf-pink/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-16 w-56 h-56 rounded-full bg-wolf-gold/15 blur-3xl pointer-events-none" />

            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-xl font-black wolf-gradient-text">📤 Send Token</h3>
                  <p className="text-[11px] text-muted-foreground">Transfer to any wallet on {CHAIN_CONFIG.chainName}</p>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
              </div>

              {/* Token selector */}
              <div className="mb-3 relative">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Token</label>
                <button
                  onClick={() => setShowTokenList(s => !s)}
                  className="w-full mt-1 flex items-center justify-between px-3 py-2.5 rounded-lg bg-wolf-surface/60 border border-wolf-border/30 hover:border-wolf-pink/40 transition-all"
                >
                  <span className="flex items-center gap-2">
                    <img src={token.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                    <span className="font-bold text-sm">{token.symbol}</span>
                    <span className="text-[10px] text-muted-foreground">{token.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">▾</span>
                </button>
                {showTokenList && (
                  <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-auto rounded-lg border border-wolf-border/30 bg-wolf-dark shadow-xl">
                    {TOKENS.map(t => (
                      <button
                        key={t.address}
                        onClick={() => { setToken(t); setShowTokenList(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-wolf-surface text-left"
                      >
                        <img src={t.logo} alt="" className="w-5 h-5 rounded-full" onError={e => { (e.target as HTMLImageElement).src = '/images/wdex-logo.png'; }} />
                        <span className="font-bold text-sm">{t.symbol}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Recipient */}
              <div className="mb-3">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Recipient Address</label>
                <input
                  value={recipient}
                  onChange={e => setRecipient(e.target.value.trim())}
                  placeholder="0x…"
                  className={`w-full mt-1 px-3 py-2.5 rounded-lg bg-wolf-surface/60 border text-sm font-mono outline-none transition-colors ${
                    recipient && !validAddress ? 'border-destructive/60'
                    : sameAsSender ? 'border-wolf-gold/60'
                    : 'border-wolf-border/30 focus:border-wolf-pink/50'
                  }`}
                />
                {recipient && !validAddress && (
                  <p className="text-[10px] text-destructive mt-1">⚠ Invalid Ethereum address</p>
                )}
                {sameAsSender && (
                  <p className="text-[10px] text-wolf-gold mt-1">⚠ You're sending to yourself</p>
                )}
              </div>

              {/* Amount */}
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Amount</label>
                  <button onClick={() => setAmount(balance)} className="text-[10px] font-bold text-wolf-pink hover:underline">
                    MAX: {parseFloat(balance).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-wolf-surface/60 border border-wolf-border/30 focus-within:border-wolf-pink/50">
                  <input
                    type="number" inputMode="decimal" placeholder="0.0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="flex-1 bg-transparent text-lg font-bold outline-none"
                  />
                  <span className="text-xs font-medium text-muted-foreground">{token.symbol}</span>
                </div>
                {overBalance && (
                  <p className="text-[10px] text-destructive mt-1">⚠ Exceeds balance</p>
                )}
              </div>

              {/* Tx preview */}
              {validAddress && amountNum > 0 && !overBalance && (
                <div className="mb-4 rounded-lg p-3 bg-gradient-to-br from-wolf-pink/10 to-wolf-gold/10 border border-wolf-pink/20 text-[11px] space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">From</span><span className="font-mono">{wallet.address?.slice(0, 8)}…{wallet.address?.slice(-6)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-mono">{recipient.slice(0, 8)}…{recipient.slice(-6)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold">{amount} {token.symbol}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span>{CHAIN_CONFIG.chainName}</span></div>
                </div>
              )}

              <button
                onClick={send}
                disabled={busy || !wallet.isConnected || !validAddress || amountNum <= 0 || overBalance}
                className="w-full wolf-btn-primary py-3 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Sending…' : !wallet.isConnected ? 'Connect wallet' : '🚀 Send Now'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
