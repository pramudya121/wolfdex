/**
 * Mounted once at the root. Loads launchpad-deployed tokens from the public
 * registry and merges them into the local custom-token list, so every
 * TokenModal across WolfDex shows their real name + logo for everyone.
 */
import { useEffect } from 'react';
import { useLaunchpadRegistry } from '@/hooks/useLaunchpadRegistry';
import { useCustomTokens } from '@/hooks/useCustomTokens';
import { ethers } from 'ethers';

export default function RegistryHydrator() {
  const { tokens } = useLaunchpadRegistry();
  const { addToken } = useCustomTokens();

  useEffect(() => {
    for (const t of tokens) {
      try {
        addToken({
          address: ethers.utils.getAddress(t.address),
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logo: t.logo_url || '/images/wdex-logo.png',
        });
      } catch { /* ignore bad rows */ }
    }
  }, [tokens, addToken]);

  return null;
}
