import { memo } from 'react';
import { cn } from '@/lib/utils';

interface WolfSkeletonProps {
  className?: string;
  /** Disable the 3D tilt animation. Useful inside table rows or tight cards. */
  flat?: boolean;
  /** Optional inline style — width/height usually go in className via tw. */
  style?: React.CSSProperties;
  'aria-label'?: string;
}

/**
 * WolfSkeleton — premium loading placeholder with:
 *   • shimmer wave (gradient sweep)
 *   • subtle 3D perspective tilt
 *   • animated multi-color glow (pink ↔ amber)
 *   • gradient border halo
 *
 * Memoized — its appearance never depends on parent state, so re-rendering
 * it on each parent update would just thrash GPU layers for no reason.
 *
 * Use `flat` inside table rows / tight grids where the perspective rotation
 * would misalign surrounding content.
 */
function WolfSkeletonImpl({
  className,
  flat = false,
  style,
  ...rest
}: WolfSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn('wolf-skeleton', flat && 'wolf-skeleton-flat', className)}
      style={style}
      {...rest}
    />
  );
}
export const WolfSkeleton = memo(WolfSkeletonImpl);
WolfSkeleton.displayName = 'WolfSkeleton';

/**
 * WolfSkeletonOrb — circular orb with two orbiting particles. Use as the
 * "loading hero" element when waiting for a network call (price quote,
 * balance fetch, AI agent reply, etc.).
 */
function WolfSkeletonOrbImpl({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className={cn('wolf-skeleton-orb', className)}
    >
      <span className="wolf-skeleton-orb-particle" aria-hidden />
      <span className="wolf-skeleton-orb-particle" aria-hidden />
    </div>
  );
}
export const WolfSkeletonOrb = memo(WolfSkeletonOrbImpl);
WolfSkeletonOrb.displayName = 'WolfSkeletonOrb';

/**
 * Convenience preset: a stack of N text-line skeletons of varying widths.
 */
export const WolfSkeletonText = memo(function WolfSkeletonText({
  lines = 3,
  className,
}: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-9/12', 'w-10/12', 'w-8/12'];
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <WolfSkeleton
          key={i}
          flat
          className={cn('h-3 rounded-md', widths[i % widths.length])}
        />
      ))}
    </div>
  );
});

/**
 * Convenience preset: a card-shaped skeleton with header bar + body lines.
 */
export const WolfSkeletonCard = memo(function WolfSkeletonCard({
  className,
}: { className?: string }) {
  return (
    <div className={cn('p-4 space-y-3', className)} aria-busy="true">
      <WolfSkeleton className="h-5 w-1/3" />
      <WolfSkeletonText lines={3} />
    </div>
  );
});

/**
 * WolfSpinner — compact inline spinner that matches the Wolf brand. Use
 * inside buttons or tight inline contexts where the full skeleton would be
 * visually too heavy. Renders an SVG conic gradient ring (pink → amber).
 */
export const WolfSpinner = memo(function WolfSpinner({
  className,
  size = 16,
}: { className?: string; size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="animate-spin"
        aria-hidden
      >
        <defs>
          <linearGradient id="wolf-spinner-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0b429" />
            <stop offset="100%" stopColor="#e040a0" />
          </linearGradient>
        </defs>
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 1-9 9"
          fill="none"
          stroke="url(#wolf-spinner-grad)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
});

