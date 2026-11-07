import { MetricsCards } from "@/components/dashboard/metrics-cards";
import { FulfillmentChart } from "@/components/dashboard/fulfillment-chart";
import { ProfitChart } from "@/components/dashboard/profit-chart";
import { LowStockList } from "@/components/dashboard/low-stock-list";
import { getDashboardMetrics } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Real-time fulfillment, inventory, and profit overview
        </p>
      </div>

      <MetricsCards metrics={metrics} />

      <div className="grid gap-6 lg:grid-cols-2">
        <FulfillmentChart data={metrics.fulfillment_breakdown} />
        <ProfitChart
          entries={metrics.profit_by_order}
          baseCurrency={metrics.profit_summary.base_currency}
        />
      </div>

      <LowStockList items={metrics.low_stock_items} />
    </div>
  );
}
