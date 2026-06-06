import { createFileRoute } from '@tanstack/react-router';
import MarketView from '@/components/dex/MarketView';

export const Route = createFileRoute('/market')({
  head: () => ({
    meta: [
      { title: 'Market — WOLFDEX' },
      { name: 'description', content: 'Discover every token launched on WolfDex. Vote, watchlist, and trade community and curated tokens on LitVM LiteForge.' },
      { property: 'og:title', content: 'WolfDex Market — Discover & Trade Tokens' },
      { property: 'og:description', content: 'Browse new launches, trending tokens, and curated assets on WolfDex.' },
    ],
  }),
  component: MarketView,
});
