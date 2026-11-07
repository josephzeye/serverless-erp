import { reserveInventory } from "@/lib/supabase/inventory";
import {
  formatAddressForSheetWithFallback,
  formatCustomerNameForSheet,
  mapShippingAddress,
  mapShopifyFulfillmentStatus,
  normalizeCurrency,
  parseOrderWebhookPayload,
  resolveLineItemSku,
} from "@/lib/shopify/mappers";
import {
  DuplicateOrderError,
  findOrderByShopifyId,
  insertOrder,
  insertOrderItems,
  inventorySkuExists,
  updateOrderStatus,
} from "@/lib/shopify/orders-repository";
import type { ShopifyOrderWebhookPayload } from "@/types";
import type { Json } from "@/types/database";

export interface IngestOrderResult {
  duplicate: boolean;
  orderId?: string;
  shopifyOrderId?: number;
  message: string;
  sheetsSynced?: boolean;
}

/** Push line items to Google Sheets, skipping rows already present */
async function syncPayloadItemsToSheets(
  payload: ShopifyOrderWebhookPayload,
  orderItems: Array<{ sku: string; quantity: number }>,
  customerName: string,
  addressLine: string,
): Promise<{ sheetErrors: string[]; appended: number }> {
  const sheetErrors: string[] = [];
  let appended = 0;

  const { appendPendingOrderIfMissing, getSheetOrderSkuKeys } =
    await import("@/lib/supplier/sheets");
  const existingKeys = await getSheetOrderSkuKeys();

  for (const item of orderItems) {
    try {
      const didAppend = await appendPendingOrderIfMissing(
        {
          order_number: payload.name,
          shopify_order_id: payload.id,
          sku: item.sku,
          quantity: item.quantity,
          customer_name: customerName,
          shipping_address: addressLine,
          status: "Processing",
          tracking_number: "",
          carrier: "",
          created_at: new Date().toISOString(),
        },
        existingKeys,
      );
      if (didAppend) {
        appended++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sheetErrors.push(`${item.sku}: ${msg}`);
    }
  }

  return { sheetErrors, appended };
}

/**
 * Core order ingestion — Supabase + inventory reserve + Google Sheets append.
 * Used by both Webhook handler and API polling sync.
 */
export async function ingestNewOrder(
  payload: ShopifyOrderWebhookPayload,
  topic: string = "orders/create",
): Promise<IngestOrderResult> {
  const shopifyOrderId = payload.id;

  const existing = await findOrderByShopifyId(shopifyOrderId);
  const shippingAddress = mapShippingAddress(payload.shipping_address);
  const customerName = formatCustomerNameForSheet(shippingAddress, payload.name);
  const addressLine = formatAddressForSheetWithFallback(
    shippingAddress,
    payload.name,
  );

  const orderItems = payload.line_items.map((item) => ({
    sku: resolveLineItemSku(item.sku, item.variant_id),
    quantity: item.quantity,
    unit_price: parseFloat(item.price),
    product_title: item.title,
  }));

  // Order already in Supabase — still try to sync missing sheet rows
  if (existing) {
    const { sheetErrors, appended } = await syncPayloadItemsToSheets(
      payload,
      orderItems,
      customerName,
      addressLine,
    );

    if (sheetErrors.length > 0) {
      return {
        duplicate: true,
        orderId: existing.id,
        shopifyOrderId,
        sheetsSynced: false,
        message: `Order exists; Google Sheets failed: ${sheetErrors.join("; ")}`,
      };
    }

    return {
      duplicate: true,
      orderId: existing.id,
      shopifyOrderId,
      sheetsSynced: appended > 0,
      message:
        appended > 0
          ? `Order exists; ${appended} row(s) synced to Google Sheets`
          : "Order already exists (sheet up to date)",
    };
  }

  let orderId: string;

  try {
    const order = await insertOrder({
      shopify_order_id: shopifyOrderId,
      order_number: payload.name,
      currency: normalizeCurrency(payload.currency),
      total_price: parseFloat(payload.total_price),
      fulfillment_status: mapShopifyFulfillmentStatus(
        payload.fulfillment_status,
        topic,
      ),
      shipping_address: shippingAddress as unknown as Json,
      customer_email: payload.email,
    });
    orderId = order.id;
  } catch (err) {
    if (err instanceof DuplicateOrderError) {
      const dup = await findOrderByShopifyId(shopifyOrderId);
      if (dup) {
        const { sheetErrors, appended } = await syncPayloadItemsToSheets(
          payload,
          orderItems,
          customerName,
          addressLine,
        );
        if (sheetErrors.length > 0) {
          return {
            duplicate: true,
            orderId: dup.id,
            shopifyOrderId,
            sheetsSynced: false,
            message: `Order exists; Google Sheets failed: ${sheetErrors.join("; ")}`,
          };
        }
        return {
          duplicate: true,
          orderId: dup.id,
          shopifyOrderId,
          sheetsSynced: appended > 0,
          message:
            appended > 0
              ? `Order exists; ${appended} row(s) synced to Google Sheets`
              : "Order already exists (race)",
        };
      }
    }
    throw err;
  }

  const orderItemsForDb = orderItems.map((item) => ({
    order_id: orderId,
    sku: item.sku,
    quantity: item.quantity,
    unit_price: item.unit_price,
    product_title: item.product_title,
  }));

  await insertOrderItems(orderItemsForDb);

  const reservationErrors: string[] = [];

  for (const item of orderItemsForDb) {
    const hasInventory = await inventorySkuExists(item.sku);
    if (hasInventory) {
      try {
        await reserveInventory(item.sku, item.quantity);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        reservationErrors.push(`${item.sku}: ${msg}`);
      }
    }
  }

  const { sheetErrors, appended } = await syncPayloadItemsToSheets(
    payload,
    orderItemsForDb,
    customerName,
    addressLine,
  );

  if (reservationErrors.length > 0) {
    await updateOrderStatus(orderId, "failed");
    return {
      duplicate: false,
      orderId,
      shopifyOrderId,
      message: `Order saved but inventory reservation failed: ${reservationErrors.join("; ")}`,
    };
  }

  if (sheetErrors.length > 0) {
    return {
      duplicate: false,
      orderId,
      shopifyOrderId,
      sheetsSynced: appended > 0,
      message: `Order saved to Supabase; Google Sheets failed: ${sheetErrors.join("; ")}`,
    };
  }

  return {
    duplicate: false,
    orderId,
    shopifyOrderId,
    sheetsSynced: true,
    message:
      appended > 0
        ? "Order created and sent to supplier"
        : "Order created (sheet rows already present)",
  };
}

/** Validate and ingest from raw JSON (webhook body or mapped GraphQL node) */
export async function ingestOrderFromPayload(
  raw: unknown,
  topic: string = "orders/create",
): Promise<IngestOrderResult> {
  const payload = parseOrderWebhookPayload(raw);
  return ingestNewOrder(payload, topic);
}
