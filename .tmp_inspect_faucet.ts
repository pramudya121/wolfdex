import { ethers } from 'ethers';

const rpc = 'https://liteforge.rpc.caldera.xyz/http';
const provider = new ethers.providers.JsonRpcProvider(rpc);
const faucet = new ethers.Contract('0x5E0B3DE95ACeeF2d46CEAF3e287370D23d90B603', [
  'function owner() view returns (address)',
  'function cooldown() view returns (uint256)',
  'function tokens(uint256) view returns (address)',
  'function claimAmounts(uint256) view returns (uint256)',
  'function maxClaims(uint256) view returns (uint256)'
], provider);
const erc20 = [
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)'
];
const curated: Record<string,string> = {
  '0x4fd3765cde8d1d2be4edbaa03940afc56794c304': 'wzkLTC',
  '0x31351646e2c5479a30f846dfa4297e9dbe189a63': 'BNB',
  '0xa12c18847c41ece267155ffae112b8951abbca1c': 'MON',
  '0xbb3b44eb672650fb4a1cf6d9dc5d3b7494f333ab': 'HYPE',
  '0x5b0ae944a4ee6241a5a638c440a0dcd42411bd3c': 'ETH',
  '0xf143ecfe3dfeeb4ae188ca4f1c7c7ab0b5f592eb': 'LITVM',
  '0xea71393074ffcb6d132b8a2b6028caf952af03a5': 'WDEX'
};

(async () => {
  console.log('owner', await faucet.owner());
  console.log('cooldown', (await faucet.cooldown()).toString());
  for (let i = 0; i < 7; i++) {
    const [token, claim, max] = await Promise.all([
      faucet.tokens(i).catch(() => ethers.constants.AddressZero),
      faucet.claimAmounts(i).catch(() => ethers.BigNumber.from(0)),
      faucet.maxClaims(i).catch(() => ethers.BigNumber.from(0)),
    ]);
    if (token === ethers.constants.AddressZero) {
      console.log(JSON.stringify({ index: i, token: 'ZERO', claim: claim.toString(), max: max.toString() }));
      continue;
    }
    const c = new ethers.Contract(token, erc20, provider);
    const [symbol, name, decimals, bal] = await Promise.all([
      c.symbol().catch(() => '?'),
      c.name().catch(() => '?'),
      c.decimals().catch(() => 18),
      c.balanceOf(faucet.address).catch(() => ethers.BigNumber.from(0)),
    ]);
    console.log(JSON.stringify({
      index: i,
      token,
      curated: curated[token.toLowerCase()] || null,
      symbol,
      name,
      decimals,
      claim: ethers.utils.formatUnits(claim, decimals),
      max: max.toString(),
      pool: ethers.utils.formatUnits(bal, decimals),
    }));
  }
})();
