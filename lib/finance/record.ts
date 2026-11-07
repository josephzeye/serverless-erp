import { calculateOrderProfit } from "@/lib/finance/calculator";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrencyCode } from "@/types";

export interface FinancialLogRecord {
  id: string;
  orderId: string;
  grossAmount: number;
  supplierCost: number;
  platformFee: number;
  netProfit: number;
  exchangeRate: number;
  baseCurrency: CurrencyCode;
}

/** Check if financial log already exists for order (idempotency) */
export async function findFinancialLogByOrderId(
  orderId: string,
): Promise<{ id: string } | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("financial_logs")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Financial log lookup failed: ${error.message}`);
  }

  return data;
}

/** Load order + items + inventory supplier costs for profit calculation */
async function loadOrderFinancialInput(orderId: string) {
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, currency, total_price")
    .eq("id", orderId)
    .single();

  if (orderError) {
    throw new Error(`Order load failed: ${orderError.message}`);
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("sku, quantity, unit_price")
    .eq("order_id", orderId);

  if (itemsError) {
    throw new Error(`Order items load failed: ${itemsError.message}`);
  }

  const skus = (items ?? []).map((i) => i.sku);
  const costMap = new Map<string, number>();

  if (skus.length > 0) {
    const { data: inventory, error: invError } = await supabase
      .from("inventory")
      .select("sku, unit_supplier_cost")
      .in("sku", skus);

    // unit_supplier_cost column requires migration 20250815100003 — degrade gracefully
    if (!invError && inventory) {
      for (const inv of inventory) {
        costMap.set(inv.sku, Number(inv.unit_supplier_cost ?? 0));
      }
    }
  }

  return {
    orderId: order.id,
    currency: order.currency as CurrencyCode,
    totalPrice: Number(order.total_price),
    lineItems: (items ?? []).map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      unitSupplierCost: costMap.get(item.sku) ?? 0,
    })),
  };
}

/**
 * Create financial_logs row when order is fulfilled.
 * Idempotent — skips if log already exists for order_id.
 */
export async function createFinancialLogForOrder(
  orderId: string,
): Promise<FinancialLogRecord | null> {
  const existing = await findFinancialLogByOrderId(orderId);
  if (existing) {
    return null;
  }

  const input = await loadOrderFinancialInput(orderId);
  const profit = await calculateOrderProfit(input);

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("financial_logs")
    .insert({
      order_id: orderId,
      gross_amount: profit.grossAmount,
      supplier_cost: profit.supplierCost,
      platform_fee: profit.platformFee,
      net_profit: profit.netProfit,
      exchange_rate: profit.exchangeRate,
      base_currency: profit.baseCurrency,
    })
    .select("id, order_id, gross_amount, supplier_cost, platform_fee, net_profit, exchange_rate, base_currency")
    .single();

  if (error?.code === "23505") {
    return null;
  }
  if (error) {
    throw new Error(`Financial log insert failed: ${error.message}`);
  }

  return {
    id: data.id,
    orderId: data.order_id,
    grossAmount: Number(data.gross_amount),
    supplierCost: Number(data.supplier_cost),
    platformFee: Number(data.platform_fee),
    netProfit: Number(data.net_profit),
    exchangeRate: Number(data.exchange_rate),
    baseCurrency: data.base_currency as CurrencyCode,
  };
}

/** Backfill financial logs for shipped orders missing logs */
export async function backfillFinancialLogs(): Promise<{
  processed: number;
  created: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = createAdminClient();

  const { data: shippedOrders, error } = await supabase
    .from("orders")
    .select("id, order_number")
    .in("fulfillment_status", ["shipped", "delivered"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load shipped orders: ${error.message}`);
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const order of shippedOrders ?? []) {
    try {
      const result = await createFinancialLogForOrder(order.id);
      if (result) {
        created++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push(
        `${order.order_number}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    processed: shippedOrders?.length ?? 0,
    created,
    skipped,
    errors,
  };
}
