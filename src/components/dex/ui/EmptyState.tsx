import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Compact mode reduces padding for inline empty rows. */
  compact?: boolean;
}

/**
 * Wolf-themed empty state with floating mascot, dashed paw orbit and
 * pulsing radial glow. Used across Portfolio / Pools / Analytics when
 * there is no data yet.
 */
export default function EmptyState({ emoji = '🐺', title, description, actions, compact }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`wolf-glass rounded-3xl text-center relative overflow-hidden ${compact ? 'p-6' : 'p-10 sm:p-14'}`}
    >
      {/* Decorative spotlight */}
      <div className="pointer-events-none absolute inset-x-0 -top-20 h-60 bg-[radial-gradient(closest-side,oklch(0.65_0.25_330/22%),transparent)]" />

      <div className="relative inline-flex items-center justify-center mb-5">
        <div className="wolf-empty-orb" />
        <div className="wolf-paw-orbit" />
        <div className="wolf-empty-mascot">{emoji}</div>
      </div>

      <h3 className="text-xl sm:text-2xl font-black wolf-gradient-text-animated mb-2 relative">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mx-auto relative">{description}</p>
      )}
      {actions && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 relative">
          {actions}
        </div>
      )}
    </motion.div>
  );
}
