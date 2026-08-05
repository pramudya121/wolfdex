/**
 * Load-balanced RPC pool. The runtime (src/lib/rpc.ts) round-robins healthy
 * endpoints and quarantines failing ones for 30s, so adding extra mirrors
 * here automatically distributes read traffic and survives single-RPC outages.
 * Keep the primary first — it's used as the fallback for write tx.
 */
export const CHAIN_CONFIG = {
  chainId: 4441,
  chainIdHex: '0x1159',
  chainName: 'LitVM LiteForge',
  rpcUrl: 'https://liteforge.rpc.caldera.xyz/http',
  rpcUrls: [
    'https://liteforge.rpc.caldera.xyz/http',
    // add additional mirrors here, e.g. 'https://rpc2.liteforge…'
  ],
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
  // Multi-token faucet — claim test tokens with cooldown + max-claims.
  // Source: 0x5E0B3DE95ACeeF2d46CEAF3e287370D23d90B603 on LitVM LiteForge.
  FAUCET: '0x5E0B3DE95ACeeF2d46CEAF3e287370D23d90B603',
  // ERC20 Launchpad — anyone can deploy a SimpleERC20 (createToken).
  // Source: 0x5C13d96355EA57D8e514Ac825A93f0be20DD84F5 on LitVM LiteForge.
  LAUNCHPAD: '0x5C13d96355EA57D8e514Ac825A93f0be20DD84F5',
  // DEX Name Service — .dex domain registry + registrar + resolver.
  DNS_REGISTRY: '0xcD94F3cF2cC78AcDA503A1C685003aA25F947fd6',
  DNS_BASE_REGISTRAR: '0x9A47Cb878Bf7B0e5b10c27F0320243381C7D0bA1',
  DNS_CONTROLLER: '0x02aC6445843e9D30F1f4512DfaA2F4289bED2224',
  DNS_RESOLVER: '0x70943a7eA0D2f717030021dbc8cce8dfaCbea79A',
};

/** TLD used by the WolfDex Name Service (e.g. "alice.wolf"). */
export const DNS_TLD = 'wolf';

/**
 * Faucet token list — order MUST match the on-chain `tokens(uint256)` slots
 * configured by the contract owner via setToken(tokenIndex, tokenAddress).
 * Each entry references a curated TOKENS symbol so the UI can show logos.
 */
export const FAUCET_TOKENS: { index: number; symbol: string }[] = [
  { index: 0, symbol: 'wzkLTC' },
  { index: 1, symbol: 'BNB' },
  { index: 2, symbol: 'MON' },
  { index: 3, symbol: 'HYPE' },
  { index: 4, symbol: 'ETH' },
  { index: 5, symbol: 'LITVM' },
  { index: 6, symbol: 'WDEX' },
  { index: 7, symbol: 'USDC' },
];


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
  {
    address: '0x4630632194D44BC7205BA41CBB0a2014AD36A4Fc',
    symbol: 'MULTY',
    name: 'Multy',
    decimals: 18,
    logo: '/images/multy-logo.jpg',
  },
  {
    address: '0x7EBfD15BDC2f222649100AC59727B5AADee03f5c',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 18,
    logo: 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png',
  },
];


/**
 * Address-level blocklist for tokens identified as scams / impostors.
 * Pools containing any of these tokens are hidden by default in the UI.
 *
 * Add lowercased addresses here. The UI also auto-detects impostors by symbol
 * collision against the curated TOKENS list (see KNOWN_SYMBOLS in PoolsView).
 */
export const TOKEN_BLOCKLIST: Set<string> = new Set<string>([
  // Reported impostor "NXR" — symbol collides with no curated token but
  // shipped with fake reserves. Keep entry as a template; safe to remove.
  '0x4dc6510000000000000000000000000000000000', // placeholder shape
]);

/** Symbols that belong exclusively to a curated token. Any other contract
 *  using the same symbol (case-insensitive) is treated as an impostor. */
export const RESERVED_SYMBOLS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const t of TOKENS) out[t.symbol.toLowerCase()] = t.address.toLowerCase();
  // Also reserve common spoof targets even when not in TOKENS list
  ['ltc', 'wbtc', 'usdt', 'usdc', 'dai'].forEach(s => { if (!out[s]) out[s] = ''; });
  return out;
})();

export function isBlockedToken(address: string): boolean {
  return TOKEN_BLOCKLIST.has(address.toLowerCase());
}

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
