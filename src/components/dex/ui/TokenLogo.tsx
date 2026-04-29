import { useMemo, useState } from 'react';
import { TOKENS } from '@/config/contracts';

/**
 * TokenLogo
 * Shows the verified logo only for curated tokens (from the static TOKENS list).
 * For any user-imported / unknown token, renders an anonymous initials avatar
 * with a deterministic gradient — never the WDEX brand logo.
 */

const VERIFIED = new Set(TOKENS.map(t => t.address.toLowerCase()));

// Deterministic pastel-ish gradient from address
function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + (h >> 8) % 120) % 360;
  return `linear-gradient(135deg, oklch(0.55 0.18 ${a}), oklch(0.45 0.18 ${b}))`;
}

export interface TokenLogoProps {
  address?: string;
  symbol?: string;
  logo?: string;
  /** override verified check (e.g. always-anonymous) */
  forceAnonymous?: boolean;
  size?: number;
  className?: string;
  ringClassName?: string;
}

export default function TokenLogo({
  address = '',
  symbol = '?',
  logo,
  forceAnonymous = false,
  size = 32,
  className = '',
  ringClassName = '',
}: TokenLogoProps) {
  const isVerified = !forceAnonymous && VERIFIED.has(address.toLowerCase());
  const [errored, setErrored] = useState(false);

  const initials = useMemo(() => {
    const s = (symbol || '?').replace(/[^a-zA-Z0-9]/g, '');
    if (!s) return '?';
    return s.slice(0, Math.min(3, s.length)).toUpperCase();
  }, [symbol]);

  const dim = { width: size, height: size };

  if (isVerified && logo && !errored) {
    return (
      <img
        src={logo}
        alt={symbol}
        style={dim}
        className={`rounded-full object-cover ${ringClassName} ${className}`}
        onError={() => setErrored(true)}
      />
    );
  }

  // Anonymous initials avatar
  return (
    <div
      role="img"
      aria-label={`${symbol} (unverified token)`}
      title={`${symbol} · unverified token`}
      style={{
        ...dim,
        background: gradientFor(address || symbol || '?'),
        fontSize: Math.max(9, Math.floor(size * 0.38)),
      }}
      className={`rounded-full flex items-center justify-center font-bold text-white/95 select-none shadow-inner ${ringClassName} ${className}`}
    >
      {initials}
    </div>
  );
}

/** Helper for img-tag-only sites: returns true when this token should render anonymously. */
export function isVerifiedToken(address: string): boolean {
  return VERIFIED.has(address.toLowerCase());
}
