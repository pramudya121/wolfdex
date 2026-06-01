import { createFileRoute } from "@tanstack/react-router";
import PoolsView from "@/components/dex/PoolsView";
import { useDexContext } from "@/context/DexContext";

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
      <PoolsView isConnected={wallet.isConnected} />
    </div>
  );
}
