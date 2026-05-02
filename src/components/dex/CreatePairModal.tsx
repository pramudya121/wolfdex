import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { CONTRACTS, CHAIN_CONFIG, isNativeToken, type TokenInfo } from '@/config/contracts';
import { FACTORY_ABI } from '@/config/abis';
import { toast } from 'sonner';
import TokenModal from './TokenModal';

interface CreatePairModalProps {
  isOpen: boolean;
  onClose: () => void;
  signer: ethers.Signer | null;
  onCreated?: () => void;
  prefillTokenA?: TokenInfo | null;
  prefillTokenB?: TokenInfo | null;
}

export default function CreatePairModal({ isOpen, onClose, signer, onCreated, prefillTokenA, prefillTokenB }: CreatePairModalProps) {
  const [tokenA, setTokenA] = useState<TokenInfo | null>(prefillTokenA ?? null);
  const [tokenB, setTokenB] = useState<TokenInfo | null>(prefillTokenB ?? null);
  const [showA, setShowA] = useState(false);
  const [showB, setShowB] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (prefillTokenA) setTokenA(prefillTokenA);
      if (prefillTokenB) setTokenB(prefillTokenB);
    }
  }, [isOpen, prefillTokenA, prefillTokenB]);

  const handleCreate = async () => {
    if (!signer || !tokenA || !tokenB) return;
    if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) {
      toast.error('Tokens must differ');
      return;
    }
    setCreating(true);
    try {
      const factory = new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, signer);
      const addrA = isNativeToken(tokenA.address) ? CONTRACTS.WETH : tokenA.address;
      const addrB = isNativeToken(tokenB.address) ? CONTRACTS.WETH : tokenB.address;
      const existing = await factory.getPair(addrA, addrB);
      if (existing !== ethers.constants.AddressZero) {
        toast.error('Pair already exists', { description: existing });
        setCreating(false);
        return;
      }
      const tx = await factory.createPair(addrA, addrB);
      toast.info('Creating pair…', { description: 'Confirm in wallet' });
      const receipt = await tx.wait();
      toast.success('Pair created!', {
        description: `${tokenA.symbol}/${tokenB.symbol}`,
        action: { label: 'View TX', onClick: () => window.open(`${CHAIN_CONFIG.blockExplorer}/tx/${receipt.transactionHash}`, '_blank') },
      });
      onCreated?.();
      onClose();
    } catch (e: any) {
      toast.error('Create failed', { description: e.reason || e.message || 'Unknown error' });
    } finally { setCreating(false); }
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
          >
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="wolf-card rounded-2xl p-5 w-full max-w-md" onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Create New Pair</h3>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">&times;</button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Deploy a new liquidity pair via the Factory contract. After creation, add initial liquidity from the Liquidity page.
              </p>

              <div className="space-y-3 mb-4">
                <button onClick={() => setShowA(true)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all"
                >
                  <span className="text-sm text-muted-foreground">Token A</span>
                  {tokenA ? (
                    <span className="flex items-center gap-2">
                      <img src={tokenA.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="font-semibold">{tokenA.symbol}</span>
                    </span>
                  ) : <span className="text-wolf-pink">Select →</span>}
                </button>

                <div className="flex justify-center text-muted-foreground">+</div>

                <button onClick={() => setShowB(true)}
                  className="w-full flex items-center justify-between p-4 rounded-xl bg-wolf-surface hover:bg-wolf-surface-hover border border-wolf-border/30 transition-all"
                >
                  <span className="text-sm text-muted-foreground">Token B</span>
                  {tokenB ? (
                    <span className="flex items-center gap-2">
                      <img src={tokenB.logo} alt="" className="w-6 h-6 rounded-full" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <span className="font-semibold">{tokenB.symbol}</span>
                    </span>
                  ) : <span className="text-wolf-pink">Select →</span>}
                </button>
              </div>

              <button onClick={handleCreate} disabled={!tokenA || !tokenB || !signer || creating}
                className="w-full py-3 rounded-xl wolf-btn-primary font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!signer ? 'Connect Wallet' : creating ? 'Creating Pair…' : 'Create Pair'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TokenModal isOpen={showA} onClose={() => setShowA(false)} onSelect={setTokenA} excludeAddress={tokenB?.address} />
      <TokenModal isOpen={showB} onClose={() => setShowB(false)} onSelect={setTokenB} excludeAddress={tokenA?.address} />
    </>
  );
}
