import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CurrencyCode,
  DashboardMetrics,
  FulfillmentStatus,
  FulfillmentStatusBreakdown,
  ProfitByOrder,
} from "@/types";

const EMPTY_METRICS: DashboardMetrics = {
  fulfillment_breakdown: [],
  profit_summary: {
    total_gross: 0,
    total_supplier_cost: 0,
    total_platform_fee: 0,
    total_net_profit: 0,
    base_currency: "USD",
    order_count: 0,
  },
  profit_by_order: [],
  low_stock_items: [],
  pending_orders_count: 0,
};

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Server-side dashboard aggregations via Supabase admin client.
 * Falls back to empty metrics when env is not configured (local scaffold).
 */
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  if (!isSupabaseConfigured()) {
    return EMPTY_METRICS;
  }

  const supabase = createAdminClient();

  const [ordersResult, financialResult, alertsResult, pendingResult] =
    await Promise.all([
      supabase.from("orders").select("fulfillment_status"),
      supabase
        .from("financial_logs")
        .select(
          "order_id, gross_amount, supplier_cost, platform_fee, net_profit, base_currency, created_at",
        )
        .order("created_at", { ascending: true }),
      supabase.from("v_inventory_alerts").select("*"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("fulfillment_status", ["pending", "processing"]),
    ]);

  if (ordersResult.error) {
    console.error(
      "Dashboard orders query failed:",
      ordersResult.error.message,
      "— check /api/supabase/test or HTTPS_PROXY in .env.local",
    );
    return EMPTY_METRICS;
  }

  if (pendingResult.error) {
    console.error(
      "Dashboard pending count failed:",
      pendingResult.error.message,
    );
  }

  if (financialResult.error) {
    console.error(
      "Dashboard financial_logs query failed:",
      financialResult.error.message,
    );
  }

  if (alertsResult.error) {
    console.error(
      "Dashboard inventory alerts query failed:",
      alertsResult.error.message,
    );
  }

  // Aggregate fulfillment status counts
  const statusCounts = new Map<FulfillmentStatus, number>();
  for (const row of ordersResult.data ?? []) {
    const status = row.fulfillment_status as FulfillmentStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const fulfillment_breakdown: FulfillmentStatusBreakdown[] = Array.from(
    statusCounts.entries(),
  ).map(([status, count]) => ({ status, count }));

  const logs = financialResult.data ?? [];

  const profit_summary = logs.reduce(
    (acc, log) => ({
      total_gross: acc.total_gross + Number(log.gross_amount),
      total_supplier_cost: acc.total_supplier_cost + Number(log.supplier_cost),
      total_platform_fee: acc.total_platform_fee + Number(log.platform_fee),
      total_net_profit: acc.total_net_profit + Number(log.net_profit),
      base_currency: (log.base_currency as CurrencyCode) ?? "USD",
      order_count: acc.order_count + 1,
    }),
    {
      total_gross: 0,
      total_supplier_cost: 0,
      total_platform_fee: 0,
      total_net_profit: 0,
      base_currency: "USD" as CurrencyCode,
      order_count: 0,
    },
  );

  // Resolve order numbers for per-order profit chart
  let profit_by_order: ProfitByOrder[] = [];

  if (logs.length > 0) {
    const orderIds = logs.map((l) => l.order_id);
    const { data: orders, error: orderLookupError } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);

    if (orderLookupError) {
      console.error(
        "Dashboard order lookup failed:",
        orderLookupError.message,
      );
    } else {
      const orderMap = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

      profit_by_order = logs.map((log) => ({
        order_number: orderMap.get(log.order_id) ?? log.order_id.slice(0, 8),
        gross_amount: Number(log.gross_amount),
        supplier_cost: Number(log.supplier_cost),
        platform_fee: Number(log.platform_fee),
        net_profit: Number(log.net_profit),
        base_currency: (log.base_currency as CurrencyCode) ?? "USD",
      }));
    }
  }

  const low_stock_items = (alertsResult.data ?? [])
    .filter((row) => row.sku && row.product_name)
    .map((row) => ({
      sku: row.sku!,
      product_name: row.product_name!,
      available_stock: row.available_stock ?? 0,
      threshold: row.threshold ?? 5,
    }));

  return {
    fulfillment_breakdown,
    profit_summary,
    profit_by_order,
    low_stock_items,
    pending_orders_count: pendingResult.count ?? 0,
  };
}
