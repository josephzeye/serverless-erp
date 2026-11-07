import { createAdminClient } from "@/lib/supabase/admin";
import type { FulfillmentStatus } from "@/types";
import type { FulfillmentRow, OrderRow } from "@/types/database";

export interface OrderWithFulfillments extends OrderRow {
  fulfillments: Pick<
    FulfillmentRow,
    "id" | "tracking_number" | "carrier" | "synced_to_shopify" | "created_at"
  >[];
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Legacy flat list — prefer getOrdersWithFulfillments */
export async function getOrders(): Promise<OrderRow[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getOrders failed:", error.message);
    return [];
  }

  return data ?? [];
}

export async function getOrdersWithFulfillments(): Promise<
  OrderWithFulfillments[]
> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      *,
      fulfillments (
        id,
        tracking_number,
        carrier,
        synced_to_shopify,
        created_at
      )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("getOrdersWithFulfillments failed:", error.message);
    return [];
  }

  return (data ?? []) as OrderWithFulfillments[];
}

export function fulfillmentStatusVariant(
  status: FulfillmentStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "shipped":
    case "delivered":
      return "default";
    case "processing":
      return "secondary";
    case "cancelled":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}
