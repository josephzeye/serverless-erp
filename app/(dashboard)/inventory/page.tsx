import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { getInventory } from "@/lib/data/inventory";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const inventory = await getInventory();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">
          Virtual stock pool with supplier cost and low-stock alerts
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock Levels</CardTitle>
          <CardDescription>
            local_stock − reserved_stock = available · unit_supplier_cost from
            migration 20250815100003
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InventoryTable inventory={inventory} />
        </CardContent>
      </Card>
    </div>
  );
}
