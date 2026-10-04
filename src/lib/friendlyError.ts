/**
 * Translate raw wallet / RPC / contract errors into short, human messages.
 * Never show users hex data, stack traces or JSON-RPC codes.
 */
const RULES: Array<[RegExp, string]> = [
  [/user rejected|user denied|ACTION_REJECTED|4001/i, 'You cancelled the request in your wallet.'],
  [/insufficient funds/i, 'Not enough ETH to pay for gas. Top up your wallet or use the Faucet.'],
  [/INSUFFICIENT_OUTPUT_AMOUNT|slippage|Too little received/i, 'Price moved too much. Increase slippage in settings or try a smaller amount.'],
  [/INSUFFICIENT_LIQUIDITY|no liquidity|INSUFFICIENT_INPUT_AMOUNT/i, 'This pool doesn\u2019t have enough liquidity for that amount.'],
  [/EXPIRED|deadline/i, 'The transaction took too long and expired. Please try again.'],
  [/transfer amount exceeds balance|exceeds balance/i, 'You don\u2019t have enough of this token.'],
  [/allowance|TRANSFER_FROM_FAILED/i, 'Token approval is missing or too low. Approve the token and retry.'],
  [/cooldown|too soon|wait/i, 'You need to wait before doing this again.'],
  [/not owner|Ownable|caller is not/i, 'Only the owner wallet can do this.'],
  [/nonce|replacement transaction/i, 'Your wallet has a stuck transaction. Reset or speed it up in your wallet.'],
  [/429|rate limit|Too Many Requests/i, 'The network is busy. Please wait a few seconds and retry.'],
  [/network|chain|could not detect|timeout|failed to fetch/i, 'Network connection problem. Check you\u2019re on LitVM and try again.'],
  [/UNPREDICTABLE_GAS_LIMIT|cannot estimate gas|execution reverted/i, 'This transaction would fail on-chain. Check amounts and balances.'],
];

export function friendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const anyE = e as { reason?: string; message?: string; code?: string | number; error?: { message?: string } } | null;
  const raw = [anyE?.code, anyE?.reason, anyE?.error?.message, anyE?.message, typeof e === 'string' ? e : '']
    .filter(Boolean)
    .join(' ');
  if (!raw) return fallback;
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  // Short clean reason from contract is fine to show as-is.
  if (anyE?.reason && anyE.reason.length < 80 && !/0x[0-9a-f]{8}/i.test(anyE.reason)) return anyE.reason;
  return fallback;
}
