import { createFileRoute } from "@tanstack/react-router";
import { Outlet, useMatches } from "@tanstack/react-router";
import CasinoView from "@/components/dex/CasinoView";

export const Route = createFileRoute("/casino")({
  head: () => ({
    meta: [
      { title: "Wolf Casino — On-chain Games | WolfDex" },
      { name: "description", content: "Eight provably on-chain casino games on LitVM LiteForge: Coinflip, Slots, Plinko, RPS, Video Poker, Roulette, Lucky Wheel, Spin to Win." },
      { property: "og:title", content: "Wolf Casino — Premium On-chain Games" },
      { property: "og:description", content: "Coinflip, Slots, Plinko, RPS, Video Poker, Roulette, Lucky Wheel, Spin to Win — every bet settled on-chain." },
    ],
  }),
  component: CasinoPage,
});

function CasinoPage() {
  const matches = useMatches();
  // If a child route (e.g. /casino/admin) is active, just render the Outlet.
  // Otherwise show the main casino lobby.
  const hasChild = matches.some(m => m.routeId !== "/casino" && m.routeId.startsWith("/casino"));
  return (
    <div className="pt-8">
      {hasChild ? <Outlet /> : <CasinoView />}
    </div>
  );
}
