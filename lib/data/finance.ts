import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrencyCode } from "@/types";

export interface FinancialLogWithOrder {
  id: string;
  order_id: string;
  order_number: string;
  order_currency: CurrencyCode;
  gross_amount: number;
  supplier_cost: number;
  platform_fee: number;
  net_profit: number;
  exchange_rate: number;
  base_currency: CurrencyCode;
  created_at: string;
}

export async function getFinancialLogsWithOrders(): Promise<
  FinancialLogWithOrder[]
> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return [];
  }

  const supabase = createAdminClient();

  const { data: logs, error: logsError } = await supabase
    .from("financial_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (logsError) {
    console.error("getFinancialLogs failed:", logsError.message);
    return [];
  }

  if (!logs?.length) {
    return [];
  }

  const orderIds = logs.map((l) => l.order_id);
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, order_number, currency")
    .in("id", orderIds);

  if (ordersError) {
    console.error("Orders join failed:", ordersError.message);
    return [];
  }

  const orderMap = new Map(
    (orders ?? []).map((o) => [o.id, o]),
  );

  return logs.map((log) => {
    const order = orderMap.get(log.order_id);
    return {
      id: log.id,
      order_id: log.order_id,
      order_number: order?.order_number ?? log.order_id.slice(0, 8),
      order_currency: (order?.currency ?? "USD") as CurrencyCode,
      gross_amount: Number(log.gross_amount),
      supplier_cost: Number(log.supplier_cost),
      platform_fee: Number(log.platform_fee),
      net_profit: Number(log.net_profit),
      exchange_rate: Number(log.exchange_rate),
      base_currency: log.base_currency as CurrencyCode,
      created_at: log.created_at,
    };
  });
}

/** Legacy alias — prefer getFinancialLogsWithOrders */
export async function getFinancialLogs() {
  return getFinancialLogsWithOrders();
}
