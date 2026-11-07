import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];

const DUPLICATE_KEY_CODE = "23505";

export class DuplicateWebhookError extends Error {
  constructor(webhookId: string) {
    super(`Webhook already processed: ${webhookId}`);
    this.name = "DuplicateWebhookError";
  }
}

export class DuplicateOrderError extends Error {
  constructor(shopifyOrderId: number) {
    super(`Order already exists: ${shopifyOrderId}`);
    this.name = "DuplicateOrderError";
  }
}

/**
 * Claim webhook idempotency slot via UNIQUE shopify_webhook_id.
 * Throws DuplicateWebhookError if already processed.
 */
export async function claimWebhookEvent(
  shopifyWebhookId: string,
  topic: string,
  shopifyOrderId?: number,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("webhook_events").insert({
    shopify_webhook_id: shopifyWebhookId,
    topic,
    shopify_order_id: shopifyOrderId ?? null,
  });

  if (error?.code === DUPLICATE_KEY_CODE) {
    throw new DuplicateWebhookError(shopifyWebhookId);
  }
  if (error) {
    throw new Error(`Failed to claim webhook event: ${error.message}`);
  }
}

/** Check if order already ingested by shopify_order_id */
export async function findOrderByShopifyId(
  shopifyOrderId: number,
): Promise<{ id: string } | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Order lookup failed: ${error.message}`);
  }

  return data;
}

/** Insert order row — throws DuplicateOrderError on conflict */
export async function insertOrder(row: OrderInsert): Promise<{ id: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .insert(row)
    .select("id")
    .single();

  if (error?.code === DUPLICATE_KEY_CODE) {
    throw new DuplicateOrderError(row.shopify_order_id);
  }
  if (error) {
    throw new Error(`Order insert failed: ${error.message}`);
  }

  return data;
}

/** Batch insert line items for an order */
export async function insertOrderItems(
  items: OrderItemInsert[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("order_items").insert(items);

  if (error) {
    throw new Error(`Order items insert failed: ${error.message}`);
  }
}

/** Update order fulfillment status by internal UUID */
export async function updateOrderStatus(
  orderId: string,
  fulfillmentStatus: Database["public"]["Enums"]["fulfillment_status"],
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("orders")
    .update({ fulfillment_status: fulfillmentStatus })
    .eq("id", orderId);

  if (error) {
    throw new Error(`Order status update failed: ${error.message}`);
  }
}

/** Update order fields from orders/updated webhook */
export async function updateOrderFromWebhook(
  shopifyOrderId: number,
  patch: Partial<OrderInsert>,
): Promise<{ id: string } | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("shopify_order_id", shopifyOrderId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Order update failed: ${error.message}`);
  }

  return data;
}

/** Fetch line items for inventory release on cancellation */
export async function getOrderItemsByShopifyOrderId(
  shopifyOrderId: number,
): Promise<Array<{ sku: string; quantity: number }>> {
  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();

  if (orderError) {
    throw new Error(`Order lookup failed: ${orderError.message}`);
  }
  if (!order) {
    return [];
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("sku, quantity")
    .eq("order_id", order.id);

  if (itemsError) {
    throw new Error(`Order items lookup failed: ${itemsError.message}`);
  }

  return items ?? [];
}

/** Check if SKU exists in inventory before attempting reservation */
export async function inventorySkuExists(sku: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("inventory")
    .select("sku")
    .eq("sku", sku)
    .maybeSingle();

  if (error) {
    throw new Error(`Inventory lookup failed: ${error.message}`);
  }

  return data !== null;
}

/** Find synced fulfillment by order + tracking (idempotency) */
export async function findSyncedFulfillment(
  orderId: string,
  trackingNumber: string,
): Promise<{ id: string } | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("fulfillments")
    .select("id")
    .eq("order_id", orderId)
    .eq("tracking_number", trackingNumber)
    .eq("synced_to_shopify", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Fulfillment lookup failed: ${error.message}`);
  }

  return data;
}

/** Insert fulfillment record after Shopify sync */
export async function insertFulfillmentRecord(input: {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  syncedToShopify: boolean;
}): Promise<{ id: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("fulfillments")
    .insert({
      order_id: input.orderId,
      tracking_number: input.trackingNumber,
      carrier: input.carrier,
      synced_to_shopify: input.syncedToShopify,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Fulfillment insert failed: ${error.message}`);
  }

  return data;
}
