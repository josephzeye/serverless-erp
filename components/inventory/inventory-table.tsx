import { Badge } from "@/components/ui/badge";
import type { InventoryRow } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

interface InventoryTableProps {
  inventory: InventoryRow[];
}

export function InventoryTable({ inventory }: InventoryTableProps) {
  if (inventory.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No inventory records. Run migrations and seed.sql to populate SKUs.
      </p>
    );
  }

  const totalStockValue = inventory.reduce((sum, item) => {
    const available = item.local_stock - item.reserved_stock;
    const cost = Number(item.unit_supplier_cost ?? 0);
    return sum + available * cost;
  }, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Total available stock value:{" "}
        <span className="font-medium text-foreground">
          {formatCurrency(totalStockValue, "USD")}
        </span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">SKU</th>
              <th className="pb-3 pr-4 font-medium">Product</th>
              <th className="pb-3 pr-4 font-medium">Local</th>
              <th className="pb-3 pr-4 font-medium">Supplier</th>
              <th className="pb-3 pr-4 font-medium">Reserved</th>
              <th className="pb-3 pr-4 font-medium">Available</th>
              <th className="pb-3 pr-4 font-medium">Unit Cost</th>
              <th className="pb-3 font-medium">Stock Value</th>
            </tr>
          </thead>
          <tbody>
            {inventory.map((item) => {
              const available = item.local_stock - item.reserved_stock;
              const isLow = available <= item.low_stock_threshold;
              const unitCost = Number(item.unit_supplier_cost ?? 0);
              const stockValue = available * unitCost;

              return (
                <tr key={item.sku} className="border-b">
                  <td className="py-3 pr-4 font-mono text-xs">{item.sku}</td>
                  <td className="py-3 pr-4">{item.product_name}</td>
                  <td className="py-3 pr-4">{item.local_stock}</td>
                  <td className="py-3 pr-4">{item.supplier_stock}</td>
                  <td className="py-3 pr-4">{item.reserved_stock}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={isLow ? "destructive" : "secondary"}>
                      {available}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    {formatCurrency(unitCost, "USD")}
                  </td>
                  <td className="py-3">
                    {formatCurrency(stockValue, "USD")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
