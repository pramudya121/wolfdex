import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useLocation } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * PageTransition — wraps the route Outlet and animates content in/out on
 * every pathname change. Honors prefers-reduced-motion and lightens the
 * effect on small/mobile viewports where blur filters are expensive.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation();
  const reduce = useReducedMotion();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Reduced motion → no animation at all, just swap contents.
  if (reduce) {
    return <div key={location.pathname}>{children}</div>;
  }

  // Mobile: skip the (expensive) blur filter and shorten duration.
  const initial = isMobile
    ? { opacity: 0, y: 6 }
    : { opacity: 0, y: 12, filter: 'blur(6px)' };
  const animate = isMobile
    ? { opacity: 1, y: 0 }
    : { opacity: 1, y: 0, filter: 'blur(0px)' };
  const exit = isMobile
    ? { opacity: 0, y: -4 }
    : { opacity: 0, y: -8, filter: 'blur(4px)' };
  const duration = isMobile ? 0.18 : 0.32;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={initial}
        animate={animate}
        exit={exit}
        transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

