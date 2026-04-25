import { type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export default function ShimmerButton({ children, className = '', ...props }: ShimmerButtonProps) {
  return (
    <button
      {...props}
      className={`shimmer-btn relative px-6 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] ${className}`}
    >
      <span className="relative z-10">{children}</span>
    </button>
  );
}
