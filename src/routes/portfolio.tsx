import { createFileRoute } from "@tanstack/react-router";
import PortfolioView from "@/components/dex/PortfolioView";
import { useDexContext } from "@/context/DexContext";

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio — Track Tokens, LP & Farming Yields | WolfDex" },
      { name: "description", content: "Your unified WolfDex dashboard: live token balances, LP positions, farming rewards, and PnL across LitVM LiteForge." },
      { property: "og:title", content: "WolfDex Portfolio — Your DeFi Dashboard" },
      { property: "og:description", content: "Track every token, LP position, and yield in a single live dashboard on LitVM." },
      { property: "og:url", content: "https://wolfdex.lovable.app/portfolio" },
    ],
    links: [{ rel: "canonical", href: "https://wolfdex.lovable.app/portfolio" }],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const { wallet, dex } = useDexContext();

  return (
    <div className="pt-8">
      <PortfolioView
        address={wallet.address}
        isConnected={wallet.isConnected}
        getTokenBalance={dex.getTokenBalance}
      />
    </div>
  );
}
