export const OPEN_WALLET_EVENT = 'wolfdex:open-wallet';

/** Opens the shared wallet picker in the header from anywhere in the app. */
export function openWalletModal() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_WALLET_EVENT));
}
