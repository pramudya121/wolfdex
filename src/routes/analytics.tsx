import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import RouteSkeleton from "@/components/dex/ui/RouteSkeleton";

const AnalyticsView = lazyWithRetry(() => import("@/components/dex/AnalyticsView"));

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — On-chain TVL, Volume & Price Charts | WolfDex" },
      { name: "description", content: "Real-time on-chain analytics for every WolfDex pair on LitVM LiteForge: TVL, 24h volume, reserves, LP supply, and live price charts." },
      { property: "og:title", content: "WolfDex Analytics — Live DEX Metrics on LitVM" },
      { property: "og:description", content: "Track TVL, trading volume, and pair price action across every WolfDex pool in real time." },
      { property: "og:url", content: "https://wolfdex.lovable.app/analytics" },
    ],
    links: [{ rel: "canonical", href: "https://wolfdex.lovable.app/analytics" }],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="pt-8">
      <Suspense fallback={<RouteSkeleton variant="grid" />}>
        <AnalyticsView />
      </Suspense>
    </div>
  );
}

