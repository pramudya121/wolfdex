import { type ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  fast?: boolean;
  pauseOnHover?: boolean;
  className?: string;
}

export default function Marquee({ children, fast, pauseOnHover = true, className = '' }: MarqueeProps) {
  return (
    <div className={`group relative flex overflow-hidden ${className}`}>
      <div
        className={`flex shrink-0 items-center gap-6 ${fast ? 'animate-marquee-fast' : 'animate-marquee'} ${pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''}`}
      >
        {children}
        {children}
      </div>
    </div>
  );
}
