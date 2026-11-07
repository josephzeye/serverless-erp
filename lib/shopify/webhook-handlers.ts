import { releaseInventoryReservation } from "@/lib/supabase/inventory";
import {
  ingestNewOrder,
  type IngestOrderResult,
} from "@/lib/shopify/ingest-order";
import {
  mapShippingAddress,
  mapShopifyFulfillmentStatus,
  normalizeCurrency,
  parseOrderWebhookPayload,
} from "@/lib/shopify/mappers";
import {
  claimWebhookEvent,
  DuplicateWebhookError,
  getOrderItemsByShopifyOrderId,
  inventorySkuExists,
  updateOrderFromWebhook,
} from "@/lib/shopify/orders-repository";
import type { Json } from "@/types/database";

export type WebhookHandlerResult = IngestOrderResult;

interface HandlerContext {
  webhookId: string;
  topic: string;
  rawPayload: unknown;
}

/**
 * orders/create — persist order, reserve inventory, append Google Sheets.
 */
export async function handleOrderCreate(
  ctx: HandlerContext,
): Promise<WebhookHandlerResult> {
  const payload = parseOrderWebhookPayload(ctx.rawPayload);

  try {
    await claimWebhookEvent(ctx.webhookId, ctx.topic, payload.id);
  } catch (err) {
    if (err instanceof DuplicateWebhookError) {
      return {
        duplicate: true,
        shopifyOrderId: payload.id,
        message: "Webhook already processed",
      };
    }
    throw err;
  }

  return ingestNewOrder(payload, ctx.topic);
}

/**
 * orders/updated — sync status/price/address without re-appending sheets.
 */
export async function handleOrderUpdated(
  ctx: HandlerContext,
): Promise<WebhookHandlerResult> {
  const payload = parseOrderWebhookPayload(ctx.rawPayload);
  const shopifyOrderId = payload.id;

  try {
    await claimWebhookEvent(ctx.webhookId, ctx.topic, shopifyOrderId);
  } catch (err) {
    if (err instanceof DuplicateWebhookError) {
      return {
        duplicate: true,
        shopifyOrderId,
        message: "Webhook already processed",
      };
    }
    throw err;
  }

  const shippingAddress = mapShippingAddress(payload.shipping_address);

  const updated = await updateOrderFromWebhook(shopifyOrderId, {
    order_number: payload.name,
    currency: normalizeCurrency(payload.currency),
    total_price: parseFloat(payload.total_price),
    fulfillment_status: mapShopifyFulfillmentStatus(
      payload.fulfillment_status,
      ctx.topic,
    ),
    shipping_address: shippingAddress as unknown as Json,
    customer_email: payload.email,
  });

  if (!updated) {
    return ingestNewOrder(payload, ctx.topic);
  }

  return {
    duplicate: false,
    orderId: updated.id,
    shopifyOrderId,
    message: "Order updated",
  };
}

/**
 * orders/cancelled — mark cancelled and release reserved inventory.
 */
export async function handleOrderCancelled(
  ctx: HandlerContext,
): Promise<WebhookHandlerResult> {
  const payload = parseOrderWebhookPayload(ctx.rawPayload);
  const shopifyOrderId = payload.id;

  try {
    await claimWebhookEvent(ctx.webhookId, ctx.topic, shopifyOrderId);
  } catch (err) {
    if (err instanceof DuplicateWebhookError) {
      return {
        duplicate: true,
        shopifyOrderId,
        message: "Webhook already processed",
      };
    }
    throw err;
  }

  const updated = await updateOrderFromWebhook(shopifyOrderId, {
    fulfillment_status: "cancelled",
  });

  if (!updated) {
    return {
      duplicate: false,
      shopifyOrderId,
      message: "Cancel received for unknown order — ignored",
    };
  }

  const items = await getOrderItemsByShopifyOrderId(shopifyOrderId);

  for (const item of items) {
    const hasInventory = await inventorySkuExists(item.sku);
    if (!hasInventory) {
      continue;
    }
    try {
      await releaseInventoryReservation(item.sku, item.quantity);
    } catch (err) {
      console.warn(
        `release_inventory_reservation skipped for ${item.sku}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    duplicate: false,
    orderId: updated.id,
    shopifyOrderId,
    message: "Order cancelled and inventory released",
  };
}

/** Dispatch webhook to topic-specific handler */
export async function dispatchShopifyWebhook(
  ctx: HandlerContext,
): Promise<WebhookHandlerResult> {
  switch (ctx.topic) {
    case "orders/create":
      return handleOrderCreate(ctx);
    case "orders/updated":
      return handleOrderUpdated(ctx);
    case "orders/cancelled":
      return handleOrderCancelled(ctx);
    case "app/uninstalled":
      return {
        duplicate: false,
        message: "App uninstalled — no action",
      };
    default:
      return {
        duplicate: false,
        message: `Unhandled topic: ${ctx.topic}`,
      };
  }
}
