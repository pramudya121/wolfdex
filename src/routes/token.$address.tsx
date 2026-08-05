import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import RouteSkeleton from '@/components/dex/ui/RouteSkeleton';

const TokenDetailView = lazy(() => import('@/components/dex/TokenDetailView'));

export const Route = createFileRoute('/token/$address')({
  head: ({ params }) => {
    const short = `${params.address.slice(0, 8)}…${params.address.slice(-6)}`;
    const title = `Token ${short} — WolfDex`;
    const description = `Live price chart, liquidity, supply and instant swap for ${params.address} on LitVM LiteForge. Trade this token directly on WolfDex.`;
    const url = `https://wolfdex.lovable.app/token/${params.address}`;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: url },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      links: [{ rel: 'canonical', href: url }],
    };
  },
  component: TokenDetailPage,
  notFoundComponent: () => (
    <div className="text-center py-20">
      <h1 className="text-2xl font-bold mb-2">Token not found</h1>
      <Link to="/market" className="text-wolf-pink underline">Back to Market</Link>
    </div>
  ),
});

function TokenDetailPage() {
  const { address } = useParams({ from: '/token/$address' });
  return (
    <Suspense fallback={<RouteSkeleton variant="grid" />}>
      <TokenDetailView address={address} />
    </Suspense>
  );
}
