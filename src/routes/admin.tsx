import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import RouteSkeleton from '@/components/dex/ui/RouteSkeleton';

const AdminAggregatorView = lazyWithRetry(() => import('@/components/dex/AdminAggregatorView'));

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Aggregator Admin — WolfDex' },
      { name: 'description', content: 'Owner-only console for the WolfDex DexAggregatorRouter: router whitelist, protocol fees, and verified token curation.' },
      { property: 'og:title', content: 'Aggregator Admin — WolfDex' },
      { property: 'og:description', content: 'Owner-only console for router whitelisting and verified token curation on WolfDex.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'robots', content: 'noindex,nofollow' },
    ],
  }),
  component: () => (
    <div className="pt-8 pb-16">
      <Suspense fallback={<RouteSkeleton variant="grid" />}>
        <AdminAggregatorView />
      </Suspense>
    </div>
  ),
});
