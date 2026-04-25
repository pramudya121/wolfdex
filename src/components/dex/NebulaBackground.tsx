import { useEffect, useRef } from 'react';

/**
 * Slow-drifting nebula / galaxy gradient blobs.
 * Sits behind CosmicParticles to give the hero a deep, cosmic feel.
 * Pure CSS animation + lightweight mouse-parallax (rAF-throttled, passive
 * listener) so the cosmos subtly tracks the cursor for an immersive 3D feel.
 */
export default function NebulaBackground() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Honor user's motion preference — no parallax for reduced-motion users.
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const root = rootRef.current;
    if (!root) return;

    let targetX = 0, targetY = 0;
    let curX = 0, curY = 0;
    let rafId = 0;

    const onMove = (e: MouseEvent) => {
      // Normalize to [-1, 1] around viewport center.
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetX = (e.clientX / w - 0.5) * 2;
      targetY = (e.clientY / h - 0.5) * 2;
    };

    const tick = () => {
      // Ease toward target (smooth lag) — different blobs use different
      // multipliers via CSS for layered depth.
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      root.style.setProperty('--nebula-mx', curX.toFixed(3));
      root.style.setProperty('--nebula-my', curY.toFixed(3));
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    rafId = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden pointer-events-none nebula-root" aria-hidden>
      {/* Base deep-space radial */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, oklch(0.18 0.05 290 / 60%) 0%, oklch(0.08 0.03 280 / 0%) 70%)',
        }}
      />
      {/* Each blob is wrapped so the inner element keeps its CSS drift
          animation while the wrapper applies mouse-parallax translation.
          Different depths (--depth) give layered 3D feel. */}
      <div className="nebula-parallax" style={{ ['--depth' as any]: 40 }}>
        <div className="nebula-blob nebula-blob-1" />
      </div>
      <div className="nebula-parallax" style={{ ['--depth' as any]: -28 }}>
        <div className="nebula-blob nebula-blob-2" />
      </div>
      <div className="nebula-parallax" style={{ ['--depth' as any]: 22 }}>
        <div className="nebula-blob nebula-blob-3" />
      </div>
      <div className="nebula-parallax" style={{ ['--depth' as any]: -55 }}>
        <div className="nebula-blob nebula-blob-4" />
      </div>
    </div>
  );
}
