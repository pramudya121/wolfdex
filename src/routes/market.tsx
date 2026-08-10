import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import RouteSkeleton from '@/components/dex/ui/RouteSkeleton';

const MarketView = lazyWithRetry(() => import('@/components/dex/MarketView'));

export const Route = createFileRoute('/market')({
  head: () => ({
    meta: [
      { title: 'Market — Every Token Launched on WolfDex' },
      { name: 'description', content: 'Browse every token launched on WolfDex with live on-chain prices, liquidity, trending movers, new launches, votes and your watchlist.' },
      { property: 'og:title', content: 'WolfDex Market — Live Token Listings' },
      { property: 'og:description', content: 'Live on-chain prices, liquidity and trending tokens launched on WolfDex.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [{ rel: 'canonical', href: 'https://wolfdex.lovable.app/market' }],
  }),
  component: () => (
    <div className="pt-4">
      <Suspense fallback={<RouteSkeleton variant="grid" />}>
        <MarketView />
      </Suspense>
    </div>
  ),
});
