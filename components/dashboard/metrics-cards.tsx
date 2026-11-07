import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import type { DashboardMetrics } from "@/types";

interface MetricsCardsProps {
  metrics: DashboardMetrics;
}

export function MetricsCards({ metrics }: MetricsCardsProps) {
  const { profit_summary, pending_orders_count, low_stock_items } = metrics;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Net Profit (USD)</CardDescription>
          <CardTitle className="text-2xl">
            {formatCurrency(profit_summary.total_net_profit, "USD")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {profit_summary.order_count} orders normalized
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Gross Revenue</CardDescription>
          <CardTitle className="text-2xl">
            {formatCurrency(profit_summary.total_gross, "USD")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Multi-currency → USD
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Pending Fulfillment</CardDescription>
          <CardTitle className="text-2xl">{pending_orders_count}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Awaiting supplier tracking
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Low Stock SKUs</CardDescription>
          <CardTitle className="text-2xl">{low_stock_items.length}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Below safety threshold
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
