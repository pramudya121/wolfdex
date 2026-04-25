import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTxSettings } from '@/context/DexContext';

interface TxSettingsPanelProps {
  open: boolean;
}

/**
 * Shared slippage + deadline + expert-mode editor.
 * Reads/writes the GLOBAL txSettings in DexContext, so SwapCard
 * and LiquidityPanel stay in sync — set once, applied everywhere.
 */
export default function TxSettingsPanel({ open }: TxSettingsPanelProps) {
  const { slippage, deadline, expertMode, setSlippage, setDeadline, setExpertMode } = useTxSettings();
  const [showExpertConfirm, setShowExpertConfirm] = useState(false);

  const slippageNum = parseFloat(slippage);
  const deadlineNum = parseFloat(deadline);

  const handleExpertToggle = () => {
    if (expertMode) {
      // turn OFF immediately, no confirmation needed
      setExpertMode(false);
    } else {
      setShowExpertConfirm(true);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mb-4 overflow-hidden"
        >
          <div className="p-3 rounded-xl bg-wolf-surface border border-wolf-border/30 space-y-4">
            {/* Header w/ global hint */}
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
                Transaction Settings
              </span>
              <div className="flex items-center gap-1.5">
                {expertMode && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-bold uppercase tracking-wider">
                    Expert
                  </span>
                )}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-wolf-pink/15 text-wolf-pink font-semibold">
                  Global · Synced
                </span>
              </div>
            </div>

            {/* Slippage */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Slippage Tolerance</label>
              <div className="flex gap-2 flex-wrap">
                {['0.1', '0.5', '1.0'].map(v => (
                  <button
                    key={v}
                    onClick={() => setSlippage(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      slippage === v
                        ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40'
                        : 'bg-wolf-dark border border-wolf-border/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >{v}%</button>
                ))}
                <input
                  type="number"
                  value={slippage}
                  onChange={e => setSlippage(e.target.value)}
                  step="0.1" min="0.01" max={expertMode ? 100 : 50}
                  className="wolf-input px-3 py-1.5 rounded-lg text-sm w-24 text-right"
                  placeholder="Custom"
                />
              </div>
              {!expertMode && slippageNum > 5 && (
                <p className="text-[10px] text-yellow-500 mt-2">⚠ High slippage — your trade may be front-run</p>
              )}
              {!expertMode && slippageNum < 0.1 && (
                <p className="text-[10px] text-yellow-500 mt-2">⚠ Very low slippage — trade may fail</p>
              )}
              {expertMode && slippageNum > 50 && (
                <p className="text-[10px] text-destructive mt-2 font-semibold">
                  🚨 Expert: {slippageNum}% slippage — extreme risk of MEV / front-running
                </p>
              )}
            </div>

            {/* Deadline */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Transaction Deadline</label>
              <div className="flex gap-2 flex-wrap items-center">
                {['10', '20', '30'].map(v => (
                  <button
                    key={v}
                    onClick={() => setDeadline(v)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      deadline === v
                        ? 'bg-wolf-pink/20 text-wolf-pink border border-wolf-pink/40'
                        : 'bg-wolf-dark border border-wolf-border/30 text-muted-foreground hover:text-foreground'
                    }`}
                  >{v} min</button>
                ))}
                <input
                  type="number"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  step="1" min="1" max="180"
                  className="wolf-input px-3 py-1.5 rounded-lg text-sm w-24 text-right"
                  placeholder="Custom"
                />
                <span className="text-[10px] text-muted-foreground">minutes</span>
              </div>
              {deadlineNum < 1 && (
                <p className="text-[10px] text-yellow-500 mt-2">⚠ Deadline too short — tx may revert</p>
              )}
            </div>

            {/* Expert Mode Toggle */}
            <div className="pt-3 border-t border-wolf-border/20">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <span>🧪</span> Expert Mode
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Allows slippage &gt; 50% &amp; disables price-impact warnings
                  </p>
                </div>
                <button
                  onClick={handleExpertToggle}
                  role="switch"
                  aria-checked={expertMode}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    expertMode ? 'bg-destructive' : 'bg-wolf-dark border border-wolf-border/40'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                      expertMode ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Expert mode confirmation */}
          <AnimatePresence>
            {showExpertConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                onClick={() => setShowExpertConfirm(false)}
              >
                <motion.div
                  initial={{ scale: 0.9, y: 20 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.9, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="w-full max-w-md rounded-2xl bg-wolf-surface border border-destructive/40 p-6 shadow-2xl"
                >
                  <div className="text-center">
                    <div className="text-4xl mb-3">⚠️</div>
                    <h3 className="text-lg font-bold text-destructive mb-2">Enable Expert Mode?</h3>
                    <div className="text-sm text-muted-foreground space-y-2 text-left bg-wolf-dark/40 rounded-xl p-3 border border-wolf-border/30">
                      <p>Expert mode <span className="font-semibold text-foreground">removes safety checks</span>:</p>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Slippage tolerance up to 100% allowed</li>
                        <li>Price-impact warnings hidden</li>
                        <li>You can lose <span className="text-destructive font-semibold">a significant portion of your funds</span> to MEV / sandwich attacks</li>
                      </ul>
                      <p className="text-[11px] text-muted-foreground/80 pt-1">
                        Only enable if you know exactly what you're doing.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-5">
                    <button
                      onClick={() => setShowExpertConfirm(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-wolf-dark border border-wolf-border/30 hover:bg-wolf-surface-hover transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setExpertMode(true);
                        setShowExpertConfirm(false);
                      }}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-destructive text-white hover:bg-destructive/90 transition"
                    >
                      I understand the risk
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
