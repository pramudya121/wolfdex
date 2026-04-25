import { createFileRoute } from "@tanstack/react-router";
import FarmingView from "@/components/dex/FarmingView";

export const Route = createFileRoute("/farming")({
  head: () => ({
    meta: [
      { title: "Wolf Farms — Stake & Earn | WolfDex" },
      { name: "description", content: "Stake your tokens and earn rewards every block on WolfDex farms. MasterChef-style farming on LitVM LiteForge." },
      { property: "og:title", content: "Wolf Farms — Stake & Earn" },
      { property: "og:description", content: "Stake your tokens and earn rewards every block. MasterChef-style farms on LitVM." },
    ],
  }),
  component: FarmingPage,
});

function FarmingPage() {
  return (
    <div className="pt-8">
      <FarmingView />
    </div>
  );
}
