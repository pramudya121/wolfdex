import { createFileRoute } from "@tanstack/react-router";
import PortfolioView from "@/components/dex/PortfolioView";
import { useDexContext } from "@/context/DexContext";

export const Route = createFileRoute("/portfolio")({
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
