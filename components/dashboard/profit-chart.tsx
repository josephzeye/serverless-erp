"use client";

import { BarChart } from "@tremor/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CurrencyCode, ProfitByOrder } from "@/types";

interface ProfitChartProps {
  entries: ProfitByOrder[];
  baseCurrency?: CurrencyCode;
}

export function ProfitChart({
  entries,
  baseCurrency = "USD",
}: ProfitChartProps) {
  const chartData = entries.map((entry) => ({
    order: entry.order_number,
    Gross: entry.gross_amount,
    "Supplier Cost": entry.supplier_cost,
    "Platform Fee": entry.platform_fee,
    "Net Profit": entry.net_profit,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit Analysis</CardTitle>
        <CardDescription>
          Per-order breakdown from financial_logs · normalized to {baseCurrency}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="flex h-52 items-center justify-center text-sm text-muted-foreground">
            No financial data yet. Fulfill orders or run backfill-finance.
          </p>
        ) : (
          <BarChart
            className="h-52"
            data={chartData}
            index="order"
            categories={[
              "Gross",
              "Supplier Cost",
              "Platform Fee",
              "Net Profit",
            ]}
            colors={["emerald", "amber", "rose", "blue"]}
            yAxisWidth={56}
            showLegend={false}
          />
        )}
      </CardContent>
    </Card>
  );
}
