import { createFileRoute } from '@tanstack/react-router';
import DomainsView from '@/components/dex/DomainsView';

export const Route = createFileRoute('/domains')({
  head: () => ({
    meta: [
      { title: 'Domains — WolfDex Name Service (.wolf)' },
      {
        name: 'description',
        content:
          'Claim your permanent Web3 identity on WolfDex. Search, mint and manage .wolf NFT domains on LitVM LiteForge.',
      },
      { property: 'og:title', content: 'WolfDex Name Service — .wolf domains' },
      {
        property: 'og:description',
        content: 'One name for all of Web3. Mint your .wolf domain NFT on WolfDex.',
      },
    ],
  }),
  component: DomainsView,
});
