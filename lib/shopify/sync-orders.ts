import { fetchShopifyOrders } from "@/lib/shopify/fetch-orders";
import type { IngestOrderResult } from "@/lib/shopify/ingest-order";

export interface SyncOrdersResult {
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  details: IngestOrderResult[];
}

export class SyncOrdersError extends Error {
  constructor(
    message: string,
    public readonly phase: "shopify_fetch" | "ingest",
  ) {
    super(message);
    this.name = "SyncOrdersError";
  }
}

/**
 * Poll Shopify GraphQL for open orders and ingest any not yet in Supabase.
 */
export async function syncOrdersFromShopify(
  options: { first?: number; query?: string } = {},
): Promise<SyncOrdersResult> {
  let orders;

  try {
    orders = await fetchShopifyOrders(options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SyncOrdersError(message, "shopify_fetch");
  }

  let ingestNewOrder: typeof import("@/lib/shopify/ingest-order").ingestNewOrder;

  try {
    ({ ingestNewOrder } = await import("@/lib/shopify/ingest-order"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SyncOrdersError(message, "ingest");
  }

  const details: IngestOrderResult[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const payload of orders) {
    try {
      const result = await ingestNewOrder(payload, "orders/create");
      details.push(result);

      if (result.duplicate) {
        skipped++;
      } else if (
        result.message.includes("inventory reservation failed") ||
        result.message.includes("Google Sheets failed")
      ) {
        failed++;
      } else {
        created++;
      }
    } catch (err) {
      failed++;
      details.push({
        duplicate: false,
        shopifyOrderId: payload.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    fetched: orders.length,
    created,
    skipped,
    failed,
    details,
  };
}
