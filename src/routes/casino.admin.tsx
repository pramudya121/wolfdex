import { createFileRoute } from "@tanstack/react-router";
import CasinoAdminPanel from "@/components/dex/CasinoAdminPanel";

export const Route = createFileRoute("/casino/admin")({
  head: () => ({
    meta: [
      { title: "Casino Admin — WolfDex" },
      { name: "description", content: "Owner-only admin panel for the WolfDex Casino contract: bankroll, settings, and on-chain event history." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CasinoAdminPage,
});

function CasinoAdminPage() {
  return (
    <div className="container mx-auto px-4 pt-8 pb-16 max-w-6xl">
      <CasinoAdminPanel />
    </div>
  );
}
