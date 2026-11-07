import { createAdminClient } from "@/lib/supabase/admin";
import type { InventoryRow } from "@/types/database";

export async function getInventory(): Promise<InventoryRow[]> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return [];
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("sku", { ascending: true });

  if (error) {
    console.error("getInventory failed:", error.message);
    return [];
  }

  return data ?? [];
}
