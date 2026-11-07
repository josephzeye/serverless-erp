import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OrdersTable } from "@/components/orders/orders-table";
import { getOrdersWithFulfillments } from "@/lib/data/orders";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await getOrdersWithFulfillments();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">
          Shopify orders with fulfillment tracking synced from supplier sheet
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>
            {orders.length} orders — tracking and carrier from fulfillments table
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersTable orders={orders} />
        </CardContent>
      </Card>
    </div>
  );
}
