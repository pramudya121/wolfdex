import { useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * RouteProgressBar — a thin gold bar at the very top of the viewport while a
 * route is loading/preloading. Gives instant feedback on navigation so pages
 * never feel "stuck" while a chunk streams in.
 */
export default function RouteProgressBar() {
  const isLoading = useRouterState({ select: s => s.status === 'pending' || s.isLoading });

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className="fixed left-0 top-0 z-[100] h-[3px] w-full origin-left bg-gradient-to-r from-wolf-gold/40 via-wolf-gold to-wolf-gold/40"
          initial={{ scaleX: 0, opacity: 0.9 }}
          animate={{ scaleX: 0.9 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
    </AnimatePresence>
  );
}
