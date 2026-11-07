/**
 * Upsert demo inventory rows into Supabase.
 * Usage: npm run seed:inventory
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

interface InventorySeedRow {
  sku: string;
  product_name: string;
  local_stock: number;
  supplier_stock: number;
  reserved_stock: number;
  low_stock_threshold: number;
  unit_supplier_cost: number;
}

/** Demo SKUs for thesis screenshots + low-stock dashboard alerts */
const INVENTORY_SEED: InventorySeedRow[] = [
  {
    sku: "SKU-001",
    product_name: "Wireless Earbuds Pro",
    local_stock: 100,
    supplier_stock: 500,
    reserved_stock: 0,
    low_stock_threshold: 10,
    unit_supplier_cost: 12.5,
  },
  {
    sku: "SKU-002",
    product_name: "USB-C Hub 7-in-1",
    local_stock: 50,
    supplier_stock: 200,
    reserved_stock: 0,
    low_stock_threshold: 5,
    unit_supplier_cost: 8.0,
  },
  {
    sku: "SKU-003",
    product_name: "Phone Stand Adjustable",
    local_stock: 4,
    supplier_stock: 80,
    reserved_stock: 0,
    low_stock_threshold: 5,
    unit_supplier_cost: 3.5,
  },
  {
    sku: "SKU-004",
    product_name: "Portable Charger 10000mAh",
    local_stock: 11,
    supplier_stock: 150,
    reserved_stock: 6,
    low_stock_threshold: 10,
    unit_supplier_cost: 9.75,
  },
  {
    sku: "SKU-DEMO-001",
    product_name: "Cross-border Widget (#1001)",
    local_stock: 120,
    supplier_stock: 300,
    reserved_stock: 0,
    low_stock_threshold: 15,
    unit_supplier_cost: 20.0,
  },
  {
    sku: "SKU-DEMO-002",
    product_name: "Travel Adapter US (#1002)",
    local_stock: 35,
    supplier_stock: 120,
    reserved_stock: 0,
    low_stock_threshold: 8,
    unit_supplier_cost: 15.0,
  },
  {
    sku: "VARIANT-4738291029384",
    product_name: "Shopify Dev Variant (no SKU)",
    local_stock: 25,
    supplier_stock: 60,
    reserved_stock: 0,
    low_stock_threshold: 5,
    unit_supplier_cost: 11.0,
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example → .env.local`);
  }
  return value;
}

async function main(): Promise<void> {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Seeding ${INVENTORY_SEED.length} inventory rows…`);

  const { data, error } = await supabase
    .from("inventory")
    .upsert(INVENTORY_SEED, { onConflict: "sku" })
    .select("sku, local_stock, reserved_stock, unit_supplier_cost");

  if (error) {
    console.error("Seed failed:", error.message);
    if (error.message.includes("inventory")) {
      console.error(
        "Hint: run supabase/migrations/*.sql in Supabase SQL Editor first.",
      );
    }
    process.exit(1);
  }

  console.log("Upserted rows:");
  for (const row of data ?? []) {
    const available =
      Number(row.local_stock) - Number(row.reserved_stock);
    console.log(
      `  ${row.sku}: available=${available}, unit_cost=$${row.unit_supplier_cost}`,
    );
  }

  const { data: alerts, error: alertError } = await supabase
    .from("v_inventory_alerts")
    .select("sku, available_stock, threshold");

  if (alertError) {
    console.warn("Could not query v_inventory_alerts:", alertError.message);
  } else {
    console.log(`\nLow-stock alerts (${alerts?.length ?? 0}):`);
    for (const a of alerts ?? []) {
      console.log(
        `  ${a.sku}: available=${a.available_stock}, threshold=${a.threshold}`,
      );
    }
  }

  console.log("\nDone. Refresh http://localhost:3000/inventory");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
