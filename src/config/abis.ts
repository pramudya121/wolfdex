export const FACTORY_ABI = [
  'function createPair(address tokenA, address tokenB) external returns (address pair)',
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
  'function allPairs(uint256) external view returns (address pair)',
  'function allPairsLength() external view returns (uint256)',
  'function feeTo() external view returns (address)',
  'function feeToSetter() external view returns (address)',
  'function INIT_CODE_PAIR_HASH() external view returns (bytes32)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
];

export const ROUTER_ABI = [
  'function factory() external view returns (address)',
  'function WETH() external view returns (address)',
  'function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)',
  'function addLiquidityETH(address token, uint256 amountTokenDesired, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)',
  'function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB)',
  'function removeLiquidityETH(address token, uint256 liquidity, uint256 amountTokenMin, uint256 amountETHMin, address to, uint256 deadline) external returns (uint256 amountToken, uint256 amountETH)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapETHForExactTokens(uint256 amountOut, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapTokensForExactETH(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external',
  'function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountOut)',
  'function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) external pure returns (uint256 amountIn)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)',
  'function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts)',
  'function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB)',
];

export const WETH_ABI = [
  'function deposit() external payable',
  'function withdraw(uint256 wad) external',
  'function approve(address guy, uint256 wad) external returns (bool)',
  'function transfer(address dst, uint256 wad) external returns (bool)',
  'function transferFrom(address src, address dst, uint256 wad) external returns (bool)',
  'function balanceOf(address) external view returns (uint256)',
  'function allowance(address, address) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
];

export const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

export const PAIR_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function transfer(address to, uint256 value) returns (bool)',
  'function transferFrom(address from, address to, uint256 value) returns (bool)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function price0CumulativeLast() view returns (uint256)',
  'function price1CumulativeLast() view returns (uint256)',
  'function kLast() view returns (uint256)',
  'function factory() view returns (address)',
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)',
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
];

export const MULTICALL_ABI = [
  'function aggregate(tuple(address target, bytes callData)[] calls) returns (uint256 blockNumber, bytes[] returnData)',
  'function getBlockHash(uint256 blockNumber) view returns (bytes32 blockHash)',
  'function getCurrentBlockTimestamp() view returns (uint256 timestamp)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
];

/**
 * MasterChef-style farming contract.
 * Source: 0x28c7167ebF6112D5B01396eEeDFe8F990Fcb54bb on LitVM LiteForge.
 *
 * Notes:
 * - Pool length is enumerated by repeatedly reading poolInfo(i) until it reverts
 *   (the contract does not expose poolLength()).
 * - `deposit(_pid, 0)` is the canonical "harvest" call (claims pending reward
 *   without changing the staked amount).
 */
export const FARMING_ABI = [
  'function owner() view returns (address)',
  'function poolInfo(uint256) view returns (address stakingToken, address rewardToken, uint256 lastRewardBlock, uint256 accRewardPerShare, uint256 rewardPerBlock, uint256 totalStaked)',
  'function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)',
  'function pendingReward(uint256 _pid, address _user) view returns (uint256)',
  'function addPool(address _stakingToken, address _rewardToken, uint256 _rewardPerBlock)',
  'function deposit(uint256 _pid, uint256 _amount)',
  'function withdraw(uint256 _pid, uint256 _amount)',
  'function emergencyWithdraw(uint256 _pid)',
  'function updatePool(uint256 _pid)',
  'function massUpdatePools()',
  'function updateRewardPerBlock(uint256 _pid, uint256 _rewardPerBlock)',
  'function transferOwnership(address newOwner)',
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event RewardPaid(address indexed user, uint256 indexed pid, uint256 amount)',
  'event PoolAdded(uint256 indexed pid, address stakingToken, address rewardToken, uint256 rewardPerBlock)',
  'event RewardPerBlockUpdated(uint256 indexed pid, uint256 rewardPerBlock)',
  'event OwnershipTransferred(address indexed prevOwner, address indexed newOwner)',
];

/**
 * WolfDex Casino — 8 mini-games settled on-chain.
 * Source: 0x5Be451a79E790a2D31FD5Db5C439D6E177987b2b on LitVM LiteForge.
 *
 * Each play* function is `payable` — msg.value is the bet (must be within
 * minBet..maxBet). Outcomes are emitted via the GameSettled event with
 * (player, game, payout, win, result-bytes).
 */
export const CASINO_ABI = [
  'function minBet() view returns (uint256)',
  'function maxBet() view returns (uint256)',
  'function houseEdgeBP() view returns (uint256)',
  'function isActive() view returns (bool)',
  'function owner() view returns (address)',
  'function deposit() payable',
  'function withdraw(uint256 amt)',
  // Optional admin setters — present in most casino contracts. If your
  // deployed bytecode lacks one, the tx simply reverts (UI shows error).
  'function setMinBet(uint256 v)',
  'function setMaxBet(uint256 v)',
  'function setHouseEdgeBP(uint256 v)',
  'function setActive(bool v)',
  'function transferOwnership(address newOwner)',
  'function playCoinflip(bool heads) payable',
  'function playLuckyWheel(uint8 segment) payable',
  'function playPlinko() payable',
  'function playRoulette(uint8 number) payable',
  'function playRPS(uint8 move) payable',
  'function playSlot(uint8[3] bet) payable',
  'function playSpinToWin() payable',
  'function playVideoPoker(uint8 guessCard) payable',
  'event BetPlaced(address indexed player, string game, uint256 amount, bytes data)',
  'event GameSettled(address player, string game, uint256 payout, bool win, bytes result)',
  'event Payout(address indexed player, uint256 amt, string game, bool win)',
  'event Deposit(address sender, uint256 amt)',
];

/**
 * On-chain Limit Order Book (LimitOrderDEX).
 * Source: 0xD20d411eCA0398095277DBA86FB8B2166c2079fF on LitVM LiteForge.
 *
 * Flow:
 *  1. Maker calls placeOrder(...) → contract escrows sellAmount (after ERC20 approve).
 *     Emits OrderPlaced(orderHash, maker, Order).
 *  2. Anyone can call fillOrder(orderHash) → contract pulls buyAmount of buyToken
 *     from caller, releases sellAmount to caller, pays buyAmount-fee to maker.
 *     Emits OrderFilled(orderHash, taker, filledSell, filledBuy, fee).
 *  3. Maker may cancelOrder(orderHash) → refunds escrow, marks cancelled.
 *     Emits OrderCancelled(orderHash, maker).
 *
 * NOTE: native zkLTC must be wrapped (WETH9) before placing — the contract is
 * pure-ERC20.
 */
export const LIMIT_ORDER_ABI = [
  // --- writes ---
  'function placeOrder(address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 expiry, uint256 nonce) returns (bytes32 orderHash)',
  'function cancelOrder(bytes32 orderHash)',
  'function fillOrder(bytes32 orderHash)',
  'function fillOrderWithSig(address maker, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 expiry, uint256 nonce, bytes sig)',
  // --- reads ---
  'function feeBasisPoints() view returns (uint256)',
  'function feeRecipient() view returns (address)',
  'function getOrder(bytes32 orderHash) view returns (tuple(address maker, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 expiry, uint256 nonce, bool cancelled))',
  'function orders(bytes32) view returns (address maker, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 expiry, uint256 nonce, bool cancelled)',
  'function usedNonces(address, uint256) view returns (bool)',
  'function whitelisted(address) view returns (bool)',
  // --- events ---
  'event OrderPlaced(bytes32 indexed orderHash, address indexed maker, tuple(address maker, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 expiry, uint256 nonce, bool cancelled) order)',
  'event OrderFilled(bytes32 indexed orderHash, address indexed taker, uint256 filledSell, uint256 filledBuy, uint256 fee)',
  'event OrderCancelled(bytes32 indexed orderHash, address indexed maker)',
];

/**
 * MultiToken Faucet — 7 ERC20 tokens claimable with cooldown + max claims.
 * Source: 0x5E0B3DE95ACeeF2d46CEAF3e287370D23d90B603 on LitVM LiteForge.
 *
 * Flow:
 *  - User calls claim(tokenIndex) → contract transfers claimAmounts[tokenIndex]
 *    of tokens[tokenIndex] to msg.sender, subject to cooldown + maxClaims.
 *  - claimAll() iterates every configured token.
 *  - Owner manages tokens (setToken), payouts (setClaimAmount), cooldown,
 *    per-user/per-token cap (setMaxClaims), refills liquidity (refill), and
 *    can withdraw via adminWithdraw.
 */
export const FAUCET_ABI = [
  // --- writes (user) ---
  'function claim(uint8 tokenIndex)',
  'function claimAll()',
  // --- writes (admin) ---
  'function adminWithdraw(uint8 tokenIndex, uint256 amount, address to)',
  'function refill(uint8 tokenIndex, uint256 amount)',
  'function setClaimAmount(uint8 tokenIndex, uint256 amount)',
  'function setCooldown(uint256 seconds_)',
  'function setMaxClaims(uint8 tokenIndex, uint256 max)',
  'function setToken(uint8 tokenIndex, address tokenAddress)',
  'function setUserClaimCount(address user, uint8 tokenIndex, uint256 count)',
  // --- reads ---
  'function owner() view returns (address)',
  'function cooldown() view returns (uint256)',
  'function tokens(uint256) view returns (address)',
  'function claimAmounts(uint256) view returns (uint256)',
  'function maxClaims(uint256) view returns (uint256)',
  'function lastClaimed(address, uint8) view returns (uint256)',
  'function userClaimCount(address, uint8) view returns (uint256)',
];

/**
 * ERC20 Launchpad — deploys a SimpleERC20 with name/symbol/supply.
 * Source: 0x5C13d96355EA57D8e514Ac825A93f0be20DD84F5 on LitVM LiteForge.
 *
 * Flow:
 *  - createToken(name, symbol, supply) → mints `supply * 10**18` to caller and
 *    emits TokenDeployed(creator, token).
 *  - getAllTokens() returns every token deployed via this launchpad.
 */
export const LAUNCHPAD_ABI = [
  'function createToken(string name, string symbol, uint256 supply)',
  'function allTokens(uint256) view returns (address)',
  'function getAllTokens() view returns (address[])',
  'event TokenDeployed(address indexed creator, address token)',
];

/**
 * DEX Name Service ABIs.
 * - Registry: node/resolver/owner mapping (ENS-style).
 * - BaseRegistrar: ERC721 for .dex tokenIds with expiries.
 * - Controller: commit/reveal registration + renewals + pricing.
 * - Resolver: public resolver for addr / text / contenthash / reverse.
 */
export const DNS_REGISTRY_ABI = [
  'function owner(bytes32 node) view returns (address)',
  'function resolver(bytes32 node) view returns (address)',
  'function ttl(bytes32 node) view returns (uint64)',
  'function setOwner(bytes32 node, address owner)',
  'function setResolver(bytes32 node, address resolver)',
  'function setTTL(bytes32 node, uint64 ttl)',
  'function setSubnodeOwner(bytes32 parent, bytes32 label, address owner) returns (bytes32 subnode)',
  'event Transfer(bytes32 indexed node, address owner)',
  'event NewResolver(bytes32 indexed node, address resolver)',
  'event NewTTL(bytes32 indexed node, uint64 ttl)',
];

export const DNS_BASE_REGISTRAR_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address account) view returns (uint256)',
  'function expiries(uint256 tokenId) view returns (uint256)',
  'function isExpired(uint256 tokenId) view returns (bool)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function controllers(address) view returns (bool)',
  'function owner() view returns (address)',
  'function registry() view returns (address)',
  'function approve(address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function reclaim(uint256 tokenId, bytes32 label)',
  'function burn(uint256 tokenId)',
  'function mint(address to, uint256 tokenId, uint256 expiry)',
  'function addController(address controller)',
  'function removeController(address controller)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)',
];

export const DNS_CONTROLLER_ABI = [
  'function isAvailable(string name) view returns (bool)',
  'function price(string name, uint256 duration) pure returns (uint256)',
  'function makeCommitment(string name, address registrant, bytes32 secret) pure returns (bytes32)',
  'function commit(bytes32 commitment, string name)',
  'function register(string name, address registrant, uint256 duration, bytes32 secret) payable',
  'function renew(string name, uint256 duration) payable',
  'function domains(string) view returns (address owner, uint256 expires)',
  'function domainInfo(string name) view returns (address, uint256, bool)',
  'function commitments(bytes32) view returns (uint256 timestamp, bytes32 nameHash, address committer)',
  'function COMMIT_REVEAL_DELAY() view returns (uint256)',
  'function COMMIT_REVEAL_EXPIRY() view returns (uint256)',
  'function GRACE_PERIOD() view returns (uint256)',
  'function MIN_REGISTRATION_DURATION() view returns (uint256)',
  'function collectedFees() view returns (uint256)',
  'function owner() view returns (address)',
  'function withdraw(address to)',
  'function transferOwnership(address newOwner)',
  'event DomainRegistered(string indexed name, address indexed owner, uint256 expires, uint256 price)',
  'event DomainRenewed(string indexed name, uint256 newExpiry, uint256 price)',
  'event Withdraw(address indexed to, uint256 amount)',
];

export const DNS_RESOLVER_ABI = [
  'function getAddress(string name, string chain) view returns (string)',
  'function getContentHash(string name) view returns (string)',
  'function getText(string name, string key) view returns (string)',
  'function getReverse(address user) view returns (string)',
  'function setAddress(string name, string chain, string addr)',
  'function setContentHash(string name, string hash)',
  'function setText(string name, string key, string value)',
  'function setReverse(address user, string name)',
];
