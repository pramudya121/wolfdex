import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import RouteSkeleton from "@/components/dex/ui/RouteSkeleton";

const AnalyticsView = lazyWithRetry(() => import("@/components/dex/AnalyticsView"));

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — On-chain Swap Activity & Reserves | WolfDex" },
      { name: "description", content: "LitVM testnet analytics for discovered pairs, indexed swap events, token reserves, and per-pair charts." },
      { property: "og:title", content: "WolfDex Analytics — On-chain Activity on LitVM" },
      { property: "og:description", content: "Review discovered pairs, indexed swap events, and token reserves from LitVM." },
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

