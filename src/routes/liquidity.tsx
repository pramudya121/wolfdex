import { createFileRoute } from "@tanstack/react-router";
import LiquidityPanel from "@/components/dex/LiquidityPanel";
import TextGenerateEffect from "@/components/dex/ui/TextGenerateEffect";
import { useDexContext } from "@/context/DexContext";

export const Route = createFileRoute("/liquidity")({
  component: LiquidityPage,
});

function LiquidityPage() {
  const { wallet, dex, invalidatePairsCache, txHistory } = useDexContext();

  // Wrap mutating actions to (a) bust the home stats cache and
  // (b) record into the global TX history for the header popover.
  const addLiquidity: typeof dex.addLiquidity = async (a, b, amtA, amtB, slippagePct, deadlineMinutes) => {
    const hash = await dex.addLiquidity(a, b, amtA, amtB, slippagePct, deadlineMinutes);
    invalidatePairsCache();
    if (hash && wallet.address) {
      txHistory.add({
        hash,
        kind: 'add-liquidity',
        summary: `+${parseFloat(amtA).toFixed(4)} ${a.symbol} + ${parseFloat(amtB).toFixed(4)} ${b.symbol}`,
        account: wallet.address,
        status: 'success',
        chainId: wallet.chainId,
      });
    }
    return hash;
  };
  const removeLiquidity: typeof dex.removeLiquidity = async (a, b, liq, pair, slippagePct, deadlineMinutes) => {
    const hash = await dex.removeLiquidity(a, b, liq, pair, slippagePct, deadlineMinutes);
    invalidatePairsCache();
    if (hash && wallet.address) {
      txHistory.add({
        hash,
        kind: 'remove-liquidity',
        summary: `-${parseFloat(liq).toFixed(4)} LP (${a.symbol}/${b.symbol})`,
        account: wallet.address,
        status: 'success',
        chainId: wallet.chainId,
      });
    }
    return hash;
  };

  return (
    <div className="flex flex-col items-center min-h-[70vh] pt-8 relative">
      <div className="spotlight w-[500px] h-[300px] -top-10 left-1/2 -translate-x-1/2" />
      <div className="text-center mb-8 relative z-10">
        <h1 className="text-3xl sm:text-4xl font-black wolf-gradient-text mb-2">
          <TextGenerateEffect text="Provide Liquidity, Earn Fees" />
        </h1>
        <p className="text-muted-foreground text-sm max-w-md">
          <TextGenerateEffect text="Add liquidity to earn 0.3% on every trade through your pool." delay={0.4} />
        </p>
      </div>
      <LiquidityPanel
        addLiquidity={addLiquidity}
        removeLiquidity={removeLiquidity}
        getTokenBalance={dex.getTokenBalance}
        getPairAddress={dex.getPairAddress}
        getPairInfo={dex.getPairInfo}
        loading={dex.loading}
        txHash={dex.txHash}
        error={dex.error}
        isConnected={wallet.isConnected}
        onConnectClick={() => {}}
      />
    </div>
  );
}
