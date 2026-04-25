export const CHAIN_CONFIG = {
  chainId: 4441,
  chainIdHex: '0x1159',
  chainName: 'LitVM LiteForge',
  rpcUrl: 'https://liteforge.rpc.caldera.xyz/http',
  symbol: 'zkLTC',
  decimals: 18,
  blockExplorer: 'https://liteforge.explorer.caldera.xyz',
};

export const CONTRACTS = {
  FACTORY: '0x5687FDA3BdE14d38057699c402606ab470EcA873',
  ROUTER: '0xd28967D75750f477E450Df81C73f34E2713B86B4',
  WETH: '0x4Fd3765cde8D1d2BE4EdbaA03940AfC56794c304',
  LIBRARY: '0x084724341e07F50782E1c3923D9a6Fb7ce993816',
  MULTICALL: '0xEc94943b75359f1ede3d639AD548e56239d754c2',
  FARMING: '0x28c7167ebF6112D5B01396eEeDFe8F990Fcb54bb',
  CASINO: '0x5Be451a79E790a2D31FD5Db5C439D6E177987b2b',
  // On-chain limit-order book — fully signed orders settled by makers/takers.
  // Source: 0xD20d411eCA0398095277DBA86FB8B2166c2079fF on LitVM LiteForge.
  LIMIT_ORDER: '0xD20d411eCA0398095277DBA86FB8B2166c2079fF',
};

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
  isNative?: boolean;
}

export const NATIVE_TOKEN: TokenInfo = {
  address: '0x0000000000000000000000000000000000000000',
  symbol: 'zkLTC',
  name: 'zkLTC',
  decimals: 18,
  logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2.png',
  isNative: true,
};

export const TOKENS: TokenInfo[] = [
  NATIVE_TOKEN,
  {
    address: CONTRACTS.WETH,
    symbol: 'wzkLTC',
    name: 'Wrapped zkLTC',
    decimals: 18,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/2.png',
  },
  {
    address: '0x31351646e2c5479A30f846dFa4297E9Dbe189a63',
    symbol: 'BNB',
    name: 'Binance Coin',
    decimals: 18,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png',
  },
  {
    address: '0xa12C18847c41ECE267155ffAe112b8951AbbcA1C',
    symbol: 'MON',
    name: 'Monad',
    decimals: 18,
    logo: '/images/mon-logo.jpg',
  },
  {
    address: '0xBB3B44EB672650Fb4a1Cf6D9dc5d3b7494F333AB',
    symbol: 'HYPE',
    name: 'Hyperliquid',
    decimals: 18,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png',
  },
  {
    address: '0x5b0AE944A4Ee6241a5A638C440A0dCD42411bD3C',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png',
  },
  {
    address: '0xF143eCFE3DFEEB4ae188cA4f1c7c7ab0b5F592eb',
    symbol: 'LITVM',
    name: 'LitVM',
    decimals: 18,
    logo: '/images/litvm-logo.png',
  },
  {
    address: '0xEa71393074fFCB6d132B8a2b6028CAF952af03A5',
    symbol: 'WDEX',
    name: 'WolfDex Token',
    decimals: 18,
    logo: '/images/wdex-logo.png',
  },
];

export function getTokenByAddress(address: string): TokenInfo | undefined {
  if (address === '0x0000000000000000000000000000000000000000') return NATIVE_TOKEN;
  return TOKENS.find(t => t.address.toLowerCase() === address.toLowerCase());
}

export function getTokenBySymbol(symbol: string): TokenInfo | undefined {
  return TOKENS.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
}

export function isNativeToken(address: string): boolean {
  return address === '0x0000000000000000000000000000000000000000';
}

export function isWrappedNative(address: string): boolean {
  return address.toLowerCase() === CONTRACTS.WETH.toLowerCase();
}

export function isWrapUnwrap(fromAddress: string, toAddress: string): 'wrap' | 'unwrap' | false {
  const fromNative = isNativeToken(fromAddress);
  const toWrapped = isWrappedNative(toAddress);
  const fromWrapped = isWrappedNative(fromAddress);
  const toNative = isNativeToken(toAddress);
  if (fromNative && toWrapped) return 'wrap';
  if (fromWrapped && toNative) return 'unwrap';
  return false;
}
