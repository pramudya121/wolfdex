import { createFileRoute } from '@tanstack/react-router';
import DomainsView from '@/components/dex/DomainsView';

export const Route = createFileRoute('/domains')({
  head: () => ({
    meta: [
      { title: 'Domains — DEX Name Service' },
      {
        name: 'description',
        content:
          'Claim your permanent Web3 identity on WolfDex. Search, mint and manage .dex NFT domains on LitVM LiteForge.',
      },
      { property: 'og:title', content: 'DEX Name Service — WOLFDEX' },
      {
        property: 'og:description',
        content: 'One name for all of Web3. Mint your .dex domain NFT on WolfDex.',
      },
    ],
  }),
  component: DomainsView,
});
