import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from '@tanstack/react-router';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import RouteErrorBoundary from './RouteErrorBoundary';
import RouteSkeleton from './ui/RouteSkeleton';

/**
 * PageTransition — wraps the route Outlet and fades content in on every
 * pathname change.
 *
 * NOTE: this deliberately does NOT use <AnimatePresence mode="wait">. With
 * lazy routes, an exit animation that gets interrupted by a fast second
 * navigation could leave AnimatePresence waiting forever — the new page never
 * mounted and the user saw an EMPTY page. A keyed enter-only animation can
 * never deadlock, and it also feels snappier.
 *
 * It also owns the route-level Suspense + error boundary so a slow or failed
 * chunk shows a skeleton / retry card instead of blank space.
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

  const body = (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteSkeleton variant="grid" />}>{children}</Suspense>
    </RouteErrorBoundary>
  );

  // Reduced motion → no animation at all, just swap contents.
  if (reduce) return <div key={location.pathname}>{body}</div>;

  return (
    <motion.div
      key={location.pathname}
      initial={isMobile ? { opacity: 0, y: 6 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: isMobile ? 0.18 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="will-change-transform"
    >
      {body}
    </motion.div>
  );
}
