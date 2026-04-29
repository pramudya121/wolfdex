import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG, type TokenInfo } from '@/config/contracts';
import { ERC20_ABI } from '@/config/abis';

const STORAGE_KEY = 'wolfdex_custom_tokens';

export function useCustomTokens() {
  const [customTokens, setCustomTokens] = useState<TokenInfo[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCustomTokens(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (next: TokenInfo[]) => {
    setCustomTokens(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const importToken = useCallback(async (address: string): Promise<TokenInfo> => {
    if (!ethers.utils.isAddress(address)) throw new Error('Invalid address');
    const provider = new ethers.providers.JsonRpcProvider(CHAIN_CONFIG.rpcUrl);
    const contract = new ethers.Contract(address, ERC20_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      contract.symbol(),
      contract.name(),
      contract.decimals(),
    ]);
    const token: TokenInfo = {
      address: ethers.utils.getAddress(address),
      symbol, name, decimals,
      logo: '/images/wdex-logo.png',
    };
    setCustomTokens(prev => {
      if (prev.some(t => t.address.toLowerCase() === token.address.toLowerCase())) return prev;
      const next = [...prev, token];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    return token;
  }, []);

  const removeToken = useCallback((address: string) => {
    persist(customTokens.filter(t => t.address.toLowerCase() !== address.toLowerCase()));
  }, [customTokens]);

  return { customTokens, importToken, removeToken };
}
