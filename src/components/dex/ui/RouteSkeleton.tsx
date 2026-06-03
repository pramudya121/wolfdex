import { memo } from 'react';
import { WolfSkeleton } from './WolfSkeleton';

/**
 * RouteSkeleton — full-route loading placeholder shown via <Suspense> while
 * a lazy-loaded view chunk (Swap, Liquidity, Pools, Analytics) is fetched.
 *
 * Two presets:
 *   - "panel"  → single centered card (Swap, Liquidity)
 *   - "grid"   → header + stat cards + table (Pools, Analytics)
 *
 * Animations rely on .wolf-skeleton CSS which already honors
 * prefers-reduced-motion globally (see src/styles.css).
 */
function RouteSkeletonImpl({ variant = 'panel' }: { variant?: 'panel' | 'grid' }) {
  if (variant === 'panel') {
    return (
      <div className="flex flex-col items-center min-h-[60vh] pt-8 px-4">
        <WolfSkeleton flat className="h-6 w-44 rounded-full mb-4" />
        <WolfSkeleton flat className="h-10 w-72 sm:w-96 rounded-lg mb-3" />
        <WolfSkeleton flat className="h-4 w-64 rounded mb-8" />
        <div className="w-full max-w-[440px] space-y-4">
          <WolfSkeleton className="h-32 w-full rounded-2xl" />
          <WolfSkeleton className="h-32 w-full rounded-2xl" />
          <WolfSkeleton flat className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  return (
    <div className="max-w-6xl mx-auto pt-8 px-4">
      <div className="mb-6 space-y-2">
        <WolfSkeleton flat className="h-9 w-72 rounded-lg" />
        <WolfSkeleton flat className="h-4 w-96 rounded" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <WolfSkeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <WolfSkeleton className="h-64 rounded-2xl" />
        <WolfSkeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

const RouteSkeleton = memo(RouteSkeletonImpl);
export default RouteSkeleton;
