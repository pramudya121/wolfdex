import { createFileRoute } from "@tanstack/react-router";
import AnalyticsView from "@/components/dex/AnalyticsView";

export const Route = createFileRoute("/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <div className="pt-8">
      <AnalyticsView />
    </div>
  );
}
