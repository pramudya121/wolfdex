import { useEffect, useState } from 'react';

const KEY = 'wolfdex.dns.primary';
export const PRIMARY_DOMAIN_EVENT = 'wolfdex:primary-domain-changed';

function readPrimary(address?: string | null): string {
  if (!address || typeof window === 'undefined') return '';
  try {
    const map = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return map[address.toLowerCase()] || '';
  } catch { return ''; }
}

/** Read (and reactively subscribe to) the primary .wolf domain for an address. */
export function usePrimaryDomain(address?: string | null): string {
  const [name, setName] = useState<string>(() => readPrimary(address));

  useEffect(() => {
    setName(readPrimary(address));
    if (typeof window === 'undefined') return;
    const sync = () => setName(readPrimary(address));
    window.addEventListener(PRIMARY_DOMAIN_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PRIMARY_DOMAIN_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [address]);

  return name;
}

/** Persist + broadcast a new primary domain label (no TLD, e.g. "alice"). */
export function setPrimaryDomainLocal(address: string, label: string) {
  if (typeof window === 'undefined' || !address) return;
  try {
    const map = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    if (label) map[address.toLowerCase()] = label;
    else delete map[address.toLowerCase()];
    window.localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(PRIMARY_DOMAIN_EVENT, { detail: { address, label } }));
  } catch { /* ignore */ }
}
