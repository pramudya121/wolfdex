import { createFileRoute } from '@tanstack/react-router';
import DocsPage from '@/components/dex/DocsPage';

export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Documentation — Guides, Contracts & FAQ | WolfDex' },
      { name: 'description', content: 'Complete WolfDex documentation: DeFi guides, smart contract references, swap and liquidity tutorials, FAQ, and roadmap for LitVM LiteForge.' },
      { property: 'og:title', content: 'WolfDex Docs — Guides, Contracts & FAQ' },
      { property: 'og:description', content: 'Everything you need to use WolfDex: tutorials, contract refs, and an FAQ for traders and LPs.' },
      { property: 'og:url', content: 'https://wolfdex.lovable.app/docs' },
    ],
    links: [{ rel: 'canonical', href: 'https://wolfdex.lovable.app/docs' }],
    scripts: [{
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
          { '@type': 'Question', name: 'What is WolfDex?', acceptedAnswer: { '@type': 'Answer', text: 'WolfDex is a decentralized exchange on the LitVM LiteForge Testnet (Chain ID 4441) offering swaps, liquidity pools, limit orders, farming, an ERC-20 launchpad, and on-chain casino games.' } },
          { '@type': 'Question', name: 'What network does WolfDex run on?', acceptedAnswer: { '@type': 'Answer', text: 'WolfDex runs on LitVM LiteForge Testnet with Chain ID 4441. Use the in-app Faucet to claim free test tokens.' } },
          { '@type': 'Question', name: 'What is the swap fee?', acceptedAnswer: { '@type': 'Answer', text: 'WolfDex charges a 0.3% fee per swap, which is paid directly to liquidity providers of the pool.' } },
          { '@type': 'Question', name: 'How do I earn with liquidity?', acceptedAnswer: { '@type': 'Answer', text: 'Add liquidity to any WolfDex pool to receive LP tokens. You automatically earn 0.3% of every swap routed through that pool, proportional to your share.' } },
          { '@type': 'Question', name: 'Can I launch my own token?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. The WolfDex Launchpad lets you deploy a verified ERC-20 in one click with a custom logo. Your token is automatically discoverable across Swap, Pools, and Portfolio.' } },
        ],
      }),
    }],
  }),
  component: DocsPage,
});
