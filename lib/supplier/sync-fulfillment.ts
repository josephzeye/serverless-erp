import { createShopifyFulfillment } from "@/lib/shopify/fulfillment";
import {
  findOrderByShopifyId,
  findSyncedFulfillment,
  insertFulfillmentRecord,
  inventorySkuExists,
  updateOrderStatus,
} from "@/lib/shopify/orders-repository";
import { fulfillInventoryDeduction } from "@/lib/supabase/inventory";
import {
  getProcessingOrdersWithTracking,
  markSheetRowsShipped,
} from "@/lib/supplier/sheets";
import type { SupplierPendingOrderSheetRow } from "@/types";

export interface SupplierSyncDetail {
  shopifyOrderId: number;
  orderNumber: string;
  trackingNumber: string;
  status: "shipped" | "skipped" | "failed";
  message: string;
}

export interface SupplierSyncResult {
  scanned: number;
  processed: number;
  skipped: number;
  failed: number;
  details: SupplierSyncDetail[];
}

interface OrderFulfillmentBatch {
  shopifyOrderId: number;
  orderNumber: string;
  trackingNumber: string;
  carrier: string;
  lineItems: Array<{ sku: string; quantity: number }>;
  sheetRowIndices: number[];
}

/** Group sheet rows by shopify_order_id + tracking_number */
function groupSheetRows(
  rows: SupplierPendingOrderSheetRow[],
): OrderFulfillmentBatch[] {
  const map = new Map<string, OrderFulfillmentBatch>();

  for (const row of rows) {
    const key = `${row.shopify_order_id}:${row.tracking_number}`;
    const existing = map.get(key);

    if (existing) {
      existing.lineItems.push({ sku: row.sku, quantity: row.quantity });
      existing.sheetRowIndices.push(row.sheetRowIndex);
      if (!existing.carrier && row.carrier) {
        existing.carrier = row.carrier;
      }
    } else {
      map.set(key, {
        shopifyOrderId: row.shopify_order_id,
        orderNumber: row.order_number,
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        lineItems: [{ sku: row.sku, quantity: row.quantity }],
        sheetRowIndices: [row.sheetRowIndex],
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Scan Google Sheets → Shopify fulfillmentCreateV2 → Supabase → inventory deduct.
 */
export async function syncSupplierFulfillments(): Promise<SupplierSyncResult> {
  const sheetRows = await getProcessingOrdersWithTracking();
  const batches = groupSheetRows(sheetRows);

  const result: SupplierSyncResult = {
    scanned: sheetRows.length,
    processed: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const batch of batches) {
    try {
      const detail = await processFulfillmentBatch(batch);
      result.details.push(detail);

      if (detail.status === "shipped") {
        result.processed++;
      } else if (detail.status === "skipped") {
        result.skipped++;
      } else {
        result.failed++;
      }
    } catch (err) {
      result.failed++;
      result.details.push({
        shopifyOrderId: batch.shopifyOrderId,
        orderNumber: batch.orderNumber,
        trackingNumber: batch.trackingNumber,
        status: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

async function processFulfillmentBatch(
  batch: OrderFulfillmentBatch,
): Promise<SupplierSyncDetail> {
  const order = await findOrderByShopifyId(batch.shopifyOrderId);

  if (!order) {
    return {
      shopifyOrderId: batch.shopifyOrderId,
      orderNumber: batch.orderNumber,
      trackingNumber: batch.trackingNumber,
      status: "failed",
      message: "Order not found in Supabase — run sync-orders first",
    };
  }

  const existing = await findSyncedFulfillment(
    order.id,
    batch.trackingNumber,
  );

  if (existing) {
    await markSheetRowsShipped(batch.sheetRowIndices);
    try {
      const { createFinancialLogForOrder } = await import("@/lib/finance/record");
      await createFinancialLogForOrder(order.id);
    } catch {
      // non-fatal
    }
    return {
      shopifyOrderId: batch.shopifyOrderId,
      orderNumber: batch.orderNumber,
      trackingNumber: batch.trackingNumber,
      status: "skipped",
      message: "Already synced to Shopify — sheet marked Shipped",
    };
  }

  const shopifyResult = await createShopifyFulfillment({
    shopifyOrderId: batch.shopifyOrderId,
    trackingNumber: batch.trackingNumber,
    carrier: batch.carrier || "Other",
  });

  await insertFulfillmentRecord({
    orderId: order.id,
    trackingNumber: shopifyResult.trackingNumber,
    carrier: shopifyResult.carrier,
    syncedToShopify: true,
  });

  await updateOrderStatus(order.id, "shipped");

  const inventoryErrors: string[] = [];

  for (const item of batch.lineItems) {
    const hasInventory = await inventorySkuExists(item.sku);
    if (!hasInventory) {
      continue;
    }
    try {
      await fulfillInventoryDeduction(item.sku, item.quantity);
    } catch (err) {
      inventoryErrors.push(
        `${item.sku}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  await markSheetRowsShipped(batch.sheetRowIndices);

  // Record profit breakdown on fulfillment (idempotent)
  try {
    const { createFinancialLogForOrder } = await import("@/lib/finance/record");
    await createFinancialLogForOrder(order.id);
  } catch (err) {
    console.warn(
      `[sync-fulfillment] Financial log failed for ${batch.orderNumber}:`,
      err instanceof Error ? err.message : err,
    );
  }

  if (inventoryErrors.length > 0) {
    return {
      shopifyOrderId: batch.shopifyOrderId,
      orderNumber: batch.orderNumber,
      trackingNumber: batch.trackingNumber,
      status: "shipped",
      message: `Fulfilled on Shopify; inventory warnings: ${inventoryErrors.join("; ")}`,
    };
  }

  return {
    shopifyOrderId: batch.shopifyOrderId,
    orderNumber: batch.orderNumber,
    trackingNumber: batch.trackingNumber,
    status: "shipped",
    message: "Fulfilled on Shopify, Supabase updated, sheet marked Shipped",
  };
}
