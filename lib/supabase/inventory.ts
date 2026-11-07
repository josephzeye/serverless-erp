import { createAdminClient } from "@/lib/supabase/admin";
import type { InventoryRow } from "@/types/database";

/**
 * Atomically reserve stock for a new order (FOR UPDATE row lock).
 * Uses service_role via admin client — bypasses RLS.
 */
export async function reserveInventory(
  sku: string,
  quantity: number,
): Promise<InventoryRow> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("reserve_inventory", {
    p_sku: sku,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(`reserve_inventory failed for ${sku}: ${error.message}`);
  }

  return data;
}

/**
 * Deduct local + reserved stock when an order ships.
 */
export async function fulfillInventoryDeduction(
  sku: string,
  quantity: number,
): Promise<InventoryRow> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("fulfill_inventory_deduction", {
    p_sku: sku,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(
      `fulfill_inventory_deduction failed for ${sku}: ${error.message}`,
    );
  }

  return data;
}

/**
 * Release reserved stock on order cancellation.
 */
export async function releaseInventoryReservation(
  sku: string,
  quantity: number,
): Promise<InventoryRow> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("release_inventory_reservation", {
    p_sku: sku,
    p_quantity: quantity,
  });

  if (error) {
    throw new Error(
      `release_inventory_reservation failed for ${sku}: ${error.message}`,
    );
  }

  return data;
}
