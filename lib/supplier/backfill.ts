import { createAdminClient } from "@/lib/supabase/admin";
import {
  appendPendingOrderIfMissing,
  getSheetOrderSkuKeys,
} from "@/lib/supplier/sheets";
import {
  formatAddressForSheetWithFallback,
  formatCustomerNameForSheet,
  mapShippingAddress,
} from "@/lib/shopify/mappers";
import type { ShippingAddress } from "@/types";
import type { Json } from "@/types/database";

export interface BackfillResult {
  ordersProcessed: number;
  rowsAppended: number;
  rowsSkipped: number;
  errors: string[];
}

function parseShippingAddress(json: Json): ShippingAddress {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return mapShippingAddress(null);
  }
  const a = json as Record<string, unknown>;
  return {
    first_name: String(a.first_name ?? ""),
    last_name: String(a.last_name ?? ""),
    address1: String(a.address1 ?? ""),
    address2: a.address2 ? String(a.address2) : undefined,
    city: String(a.city ?? ""),
    province: String(a.province ?? ""),
    country: String(a.country ?? ""),
    zip: String(a.zip ?? ""),
    phone: a.phone ? String(a.phone) : undefined,
  };
}

/**
 * Backfill Supabase orders → Google Sheets Pending_Orders.
 * Skips rows already present (matched by shopify_order_id + sku).
 */
export async function backfillOrdersToSheets(): Promise<BackfillResult> {
  const supabase = createAdminClient();
  const existingKeys = await getSheetOrderSkuKeys();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, shopify_order_id, order_number, shipping_address, created_at")
    .in("fulfillment_status", ["pending", "processing"])
    .order("created_at", { ascending: true });

  if (ordersError) {
    throw new Error(`Failed to load orders: ${ordersError.message}`);
  }

  let rowsAppended = 0;
  let rowsSkipped = 0;
  const errors: string[] = [];

  for (const order of orders ?? []) {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("sku, quantity")
      .eq("order_id", order.id);

    if (itemsError) {
      errors.push(`Order ${order.order_number}: ${itemsError.message}`);
      continue;
    }

    const shippingAddress = parseShippingAddress(order.shipping_address);
    const customerName = formatCustomerNameForSheet(
      shippingAddress,
      order.order_number,
    );
    const addressLine = formatAddressForSheetWithFallback(
      shippingAddress,
      order.order_number,
    );

    for (const item of items ?? []) {
      try {
        const appended = await appendPendingOrderIfMissing(
          {
            order_number: order.order_number,
            shopify_order_id: order.shopify_order_id,
            sku: item.sku,
            quantity: item.quantity,
            customer_name: customerName,
            shipping_address: addressLine,
            status: "Processing",
            tracking_number: "",
            carrier: "",
            created_at: order.created_at,
          },
          existingKeys,
        );

        if (appended) {
          rowsAppended++;
        } else {
          rowsSkipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${order.order_number}/${item.sku}: ${msg}`);
      }
    }
  }

  return {
    ordersProcessed: orders?.length ?? 0,
    rowsAppended,
    rowsSkipped,
    errors,
  };
}
