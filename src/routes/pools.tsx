import { createFileRoute } from "@tanstack/react-router";
import PoolsView from "@/components/dex/PoolsView";
import { useDexContext } from "@/context/DexContext";

export const Route = createFileRoute("/pools")({
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
