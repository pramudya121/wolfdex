import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';

/**
 * PageTransition — wraps the route Outlet and animates content in/out on
 * every pathname change. Uses a subtle fade + lift to keep navigation
 * feeling premium without being distracting. Mounted once in __root.tsx.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
