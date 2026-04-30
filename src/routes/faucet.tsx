import { createFileRoute } from '@tanstack/react-router';
import FaucetView from '@/components/dex/FaucetView';

export const Route = createFileRoute('/faucet')({
  head: () => ({
    meta: [
      { title: 'Faucet — WOLFDEX' },
      { name: 'description', content: 'Claim free test tokens (wzkLTC, BNB, MON, HYPE, ETH, LITVM, WDEX) for the LitVM LiteForge testnet.' },
      { property: 'og:title', content: 'Faucet — WOLFDEX' },
      { property: 'og:description', content: 'Claim free test tokens for LitVM LiteForge.' },
    ],
  }),
  component: () => <div className="pt-8"><FaucetView /></div>,
});
