import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTxSettings } from '@/context/DexContext';
import TxSettingsPanel from './TxSettingsPanel';

/**
 * Compact header badge showing current global tx settings.
 * Click → opens a modal with the full TxSettingsPanel for quick edits
 * without having to scroll into SwapCard / LiquidityPanel.
 */
export default function TxSettingsBadge() {
  const { slippage, deadline, expertMode } = useTxSettings();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Transaction settings (slippage / deadline / expert mode)"
        className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
          expertMode
            ? 'bg-destructive/15 border border-destructive/40 text-destructive hover:bg-destructive/25'
            : 'bg-wolf-surface border border-wolf-border/40 text-muted-foreground hover:text-foreground hover:border-wolf-pink/40'
        }`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        {expertMode ? (
          <>
            <span className="font-bold tracking-wider">EXPERT</span>
            <span className="opacity-70">· {slippage}%</span>
          </>
        ) : (
          <>
            <span>{slippage}%</span>
            <span className="opacity-50">·</span>
            <span>{deadline}m</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 pt-20 sm:pt-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 10, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md wolf-card rounded-2xl p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold">Transaction Settings</h3>
                  <p className="text-[11px] text-muted-foreground">Applied across Swap &amp; Liquidity</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-lg bg-wolf-surface border border-wolf-border/30 hover:border-wolf-red/40 transition flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* Reuse the exact same settings panel — single source of truth */}
              <TxSettingsPanel open={true} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}