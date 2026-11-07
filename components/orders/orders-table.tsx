import { Badge } from "@/components/ui/badge";
import {
  fulfillmentStatusVariant,
  type OrderWithFulfillments,
} from "@/lib/data/orders";
import { formatCurrency } from "@/lib/utils";
import type { FulfillmentStatus } from "@/types";

interface OrdersTableProps {
  orders: OrderWithFulfillments[];
}

function latestFulfillment(order: OrderWithFulfillments) {
  if (!order.fulfillments?.length) {
    return null;
  }

  return [...order.fulfillments].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function OrdersTable({ orders }: OrdersTableProps) {
  if (orders.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No orders yet. Run{" "}
        <code className="rounded bg-muted px-1">/api/cron/sync-orders</code> to
        pull Shopify orders.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Order #</th>
            <th className="pb-3 pr-4 font-medium">Shopify ID</th>
            <th className="pb-3 pr-4 font-medium">Status</th>
            <th className="pb-3 pr-4 font-medium">Tracking</th>
            <th className="pb-3 pr-4 font-medium">Carrier</th>
            <th className="pb-3 pr-4 font-medium">Synced</th>
            <th className="pb-3 pr-4 font-medium">Total</th>
            <th className="pb-3 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const fulfillment = latestFulfillment(order);
            const status = order.fulfillment_status as FulfillmentStatus;

            return (
              <tr key={order.id} className="border-b">
                <td className="py-3 pr-4 font-medium">{order.order_number}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {order.shopify_order_id}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={fulfillmentStatusVariant(status)}>
                    {status}
                  </Badge>
                </td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {fulfillment?.tracking_number ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  {fulfillment?.carrier || "—"}
                </td>
                <td className="py-3 pr-4">
                  {fulfillment ? (
                    <Badge
                      variant={
                        fulfillment.synced_to_shopify ? "default" : "secondary"
                      }
                    >
                      {fulfillment.synced_to_shopify ? "Yes" : "No"}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 pr-4">
                  {formatCurrency(Number(order.total_price), order.currency)}
                </td>
                <td className="py-3 text-muted-foreground">
                  {formatDate(order.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
