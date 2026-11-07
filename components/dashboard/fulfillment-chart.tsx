"use client";

import { DonutChart, Legend } from "@tremor/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { FulfillmentStatusBreakdown } from "@/types";

interface FulfillmentChartProps {
  data: FulfillmentStatusBreakdown[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "slate",
  processing: "amber",
  shipped: "blue",
  delivered: "emerald",
  cancelled: "rose",
  failed: "red",
};

export function FulfillmentChart({ data }: FulfillmentChartProps) {
  const chartData = data.map((item) => ({
    name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
    value: item.count,
    color: STATUS_COLORS[item.status] ?? "gray",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fulfillment Status</CardTitle>
        <CardDescription>Real-time order status breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <>
            <DonutChart
              className="mx-auto h-52"
              data={chartData}
              category="value"
              index="name"
              colors={chartData.map((d) => d.color as "slate")}
              showLabel
            />
            <Legend
              className="mt-4 justify-center"
              categories={chartData.map((d) => d.name)}
              colors={chartData.map((d) => d.color as "slate")}
            />
          </>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No order data yet — connect Shopify webhooks to populate.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
