import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { CHAIN_CONFIG } from '@/config/contracts';

export type WalletType = 'metamask' | 'okx' | 'rabby' | 'bitget';

interface WalletState {
  address: string | null;
  chainId: number | null;
  provider: ethers.providers.Web3Provider | null;
  signer: ethers.Signer | null;
  isConnecting: boolean;
  isConnected: boolean;
  walletType: WalletType | null;
  balance: string;
}

function getWalletProvider(type: WalletType): any {
  const w = window as any;
  switch (type) {
    case 'metamask': return w.ethereum?.isMetaMask ? w.ethereum : w.ethereum;
    case 'okx': return w.okxwallet;
    case 'rabby': return w.rabby || (w.ethereum?.isRabby ? w.ethereum : null);
    case 'bitget': return w.bitkeep?.ethereum || w.bitget?.ethereum;
    default: return null;
  }
}

const WALLET_LABELS: Record<WalletType, string> = {
  metamask: 'MetaMask',
  okx: 'OKX Wallet',
  rabby: 'Rabby Wallet',
  bitget: 'Bitget Wallet',
};

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null, chainId: null, provider: null, signer: null,
    isConnecting: false, isConnected: false, walletType: null, balance: '0',
  });

  const switchChain = useCallback(async (ethereum: any) => {
    // First check if user is already on the right chain — skip prompts entirely.
    try {
      const currentHex: string = await ethereum.request({ method: 'eth_chainId' });
      if (currentHex?.toLowerCase() === CHAIN_CONFIG.chainIdHex.toLowerCase()) return;
    } catch { /* fall through */ }

    // Try to switch first. If the chain is unknown to the wallet (4902 / -32603 / generic),
    // add it directly — addEthereumChain also switches in most wallets.
    const addChain = () => ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: CHAIN_CONFIG.chainIdHex,
        chainName: CHAIN_CONFIG.chainName,
        rpcUrls: [CHAIN_CONFIG.rpcUrl],
        nativeCurrency: { name: CHAIN_CONFIG.symbol, symbol: CHAIN_CONFIG.symbol, decimals: 18 },
        blockExplorerUrls: [CHAIN_CONFIG.blockExplorer],
      }],
    });

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_CONFIG.chainIdHex }],
      });
    } catch (e: any) {
      // 4902 = chain not added. Some wallets (OKX, Bitget, certain MetaMask versions)
      // return -32603 or a generic error instead — try adding in all those cases.
      const code = e?.code;
      const msg = String(e?.message || '').toLowerCase();
      const looksUnknownChain =
        code === 4902 ||
        code === -32603 ||
        msg.includes('unrecognized chain') ||
        msg.includes('not added') ||
        msg.includes('unknown chain');
      if (looksUnknownChain) {
        await addChain();
      } else {
        throw e;
      }
    }
  }, []);

  const fetchBalance = useCallback(async (provider: ethers.providers.Web3Provider, address: string) => {
    try {
      const bal = await provider.getBalance(address);
      return ethers.utils.formatEther(bal);
    } catch { return '0'; }
  }, []);

  const connect = useCallback(async (type: WalletType) => {
    setState(s => ({ ...s, isConnecting: true }));
    try {
      const ethereum = getWalletProvider(type);
      if (!ethereum) throw new Error(`${WALLET_LABELS[type]} not found. Please install it.`);

      await ethereum.request({ method: 'eth_requestAccounts' });
      await switchChain(ethereum);

      const provider = new ethers.providers.Web3Provider(ethereum);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await fetchBalance(provider, address);

      setState({
        address, chainId: network.chainId, provider, signer,
        isConnecting: false, isConnected: true, walletType: type, balance,
      });
      localStorage.setItem('wolfdex_wallet', type);
    } catch (err: any) {
      setState(s => ({ ...s, isConnecting: false }));
      throw err;
    }
  }, [switchChain, fetchBalance]);

  const disconnect = useCallback(() => {
    setState({
      address: null, chainId: null, provider: null, signer: null,
      isConnecting: false, isConnected: false, walletType: null, balance: '0',
    });
    localStorage.removeItem('wolfdex_wallet');
  }, []);

  const refreshBalance = useCallback(async () => {
    if (state.provider && state.address) {
      const balance = await fetchBalance(state.provider, state.address);
      setState(s => ({ ...s, balance }));
    }
  }, [state.provider, state.address, fetchBalance]);

  useEffect(() => {
    const saved = localStorage.getItem('wolfdex_wallet') as WalletType | null;
    if (saved) connect(saved).catch(() => localStorage.removeItem('wolfdex_wallet'));
  }, [connect]);

  useEffect(() => {
    const ethereum = state.walletType ? getWalletProvider(state.walletType) : null;
    if (!ethereum) return;
    const handleAccounts = (accounts: string[]) => {
      if (accounts.length === 0) disconnect();
      else setState(s => ({ ...s, address: accounts[0] }));
    };
    const handleChain = () => { if (state.walletType) connect(state.walletType).catch(() => {}); };
    ethereum.on('accountsChanged', handleAccounts);
    ethereum.on('chainChanged', handleChain);
    return () => {
      ethereum.removeListener('accountsChanged', handleAccounts);
      ethereum.removeListener('chainChanged', handleChain);
    };
  }, [state.walletType, connect, disconnect]);

  return { ...state, connect, disconnect, refreshBalance, WALLET_LABELS };
}
