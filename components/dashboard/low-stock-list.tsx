import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InventoryAlert } from "@/types";

interface LowStockListProps {
  items: InventoryAlert[];
}

export function LowStockList({ items }: LowStockListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Low Stock Alerts</CardTitle>
        <CardDescription>
          SKUs at or below safety threshold (v_inventory_alerts)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            All SKUs above threshold.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">SKU</th>
                  <th className="pb-3 pr-4 font-medium">Product</th>
                  <th className="pb-3 pr-4 font-medium">Available</th>
                  <th className="pb-3 font-medium">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.sku} className="border-b">
                    <td className="py-3 pr-4 font-mono text-xs">{item.sku}</td>
                    <td className="py-3 pr-4">{item.product_name}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="destructive">{item.available_stock}</Badge>
                    </td>
                    <td className="py-3">{item.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
