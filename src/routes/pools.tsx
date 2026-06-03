import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import RouteSkeleton from "@/components/dex/ui/RouteSkeleton";
import { useDexContext } from "@/context/DexContext";

const PoolsView = lazy(() => import("@/components/dex/PoolsView"));

export const Route = createFileRoute("/pools")({
  head: () => ({
    meta: [
      { title: "Liquidity Pools — Browse & Create Pairs | WolfDex" },
      { name: "description", content: "Explore every on-chain liquidity pool on WolfDex or permissionlessly create a new pair in one click on LitVM LiteForge." },
      { property: "og:title", content: "WolfDex Pools — Permissionless Pair Creation" },
      { property: "og:description", content: "Browse active pools, inspect reserves and LP supply, or launch your own pair with a single transaction." },
      { property: "og:url", content: "https://wolfdex.lovable.app/pools" },
    ],
    links: [{ rel: "canonical", href: "https://wolfdex.lovable.app/pools" }],
  }),
  component: PoolsPage,
});

function PoolsPage() {
  const { wallet } = useDexContext();

  return (
    <div className="pt-8">
      <Suspense fallback={<RouteSkeleton variant="grid" />}>
        <PoolsView isConnected={wallet.isConnected} />
      </Suspense>
    </div>
  );
}

