import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getFinancialLogsWithOrders } from "@/lib/data/finance";
import { formatCurrency } from "@/lib/utils";

/** Always fetch fresh financial data — never cache empty SSR snapshot */
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const logs = await getFinancialLogsWithOrders();

  const totals = logs.reduce(
    (acc, log) => ({
      gross: acc.gross + log.gross_amount,
      cost: acc.cost + log.supplier_cost,
      fee: acc.fee + log.platform_fee,
      profit: acc.profit + log.net_profit,
    }),
    { gross: 0, cost: 0, fee: 0, profit: 0 },
  );

  const baseCurrency = logs[0]?.base_currency ?? "USD";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
        <p className="text-muted-foreground">
          Multi-currency profit analysis normalized to {baseCurrency}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross ({baseCurrency})</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(totals.gross, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Supplier Cost</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(totals.cost, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Platform Fee</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(totals.fee, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net Profit</CardDescription>
            <CardTitle className="text-xl">
              {formatCurrency(totals.profit, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Financial Logs</CardTitle>
          <CardDescription>
            Per-order profit on fulfillment — 2 decimal precision, USD normalized
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No financial records yet. Run{" "}
              <code className="rounded bg-muted px-1">/api/cron/backfill-finance</code>{" "}
              for shipped orders, or fulfill new orders via sync-supplier.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Order</th>
                    <th className="pb-3 pr-4 font-medium">Currency</th>
                    <th className="pb-3 pr-4 font-medium">Rate→USD</th>
                    <th className="pb-3 pr-4 font-medium">Gross</th>
                    <th className="pb-3 pr-4 font-medium">Cost</th>
                    <th className="pb-3 pr-4 font-medium">Fee</th>
                    <th className="pb-3 font-medium">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b">
                      <td className="py-3 pr-4 font-medium">
                        {log.order_number}
                      </td>
                      <td className="py-3 pr-4">{log.order_currency}</td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {log.exchange_rate.toFixed(4)}
                      </td>
                      <td className="py-3 pr-4">
                        {formatCurrency(log.gross_amount, log.base_currency)}
                      </td>
                      <td className="py-3 pr-4">
                        {formatCurrency(log.supplier_cost, log.base_currency)}
                      </td>
                      <td className="py-3 pr-4">
                        {formatCurrency(log.platform_fee, log.base_currency)}
                      </td>
                      <td className="py-3">
                        {formatCurrency(log.net_profit, log.base_currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
