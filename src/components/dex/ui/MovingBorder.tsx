import { type ReactNode } from 'react';

interface MovingBorderProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}

/** Aceternity-style animated gradient border wrapper */
export default function MovingBorder({ children, className = '', innerClassName = '' }: MovingBorderProps) {
  return (
    <div className={`moving-border-wrap ${className}`}>
      <div className={`moving-border-inner ${innerClassName}`}>{children}</div>
    </div>
  );
}
