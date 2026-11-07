import { google } from "googleapis";
import type {
  SupplierPendingOrderRow,
  SupplierPendingOrderSheetRow,
  SupplierSheetConfig,
} from "@/types";
import {
  createGoogleAuthClient,
  formatGoogleError,
} from "@/lib/supplier/google-auth";
import { requireEnv } from "@/lib/utils";

/** Build authenticated Google Sheets client via Service Account */
function createSheetsClient() {
  const auth = createGoogleAuthClient();
  return google.sheets({ version: "v4", auth });
}

/** Load sheet config from environment variables */
export function getSheetConfig(): SupplierSheetConfig {
  return {
    spreadsheetId: requireEnv("GOOGLE_SHEET_ID"),
    pendingOrdersTab:
      process.env.GOOGLE_SHEET_PENDING_ORDERS_TAB ?? "Pending_Orders",
  };
}

/** Validate env vars are present (call before sync) */
export function assertGoogleSheetsConfigured(): void {
  requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  requireEnv("GOOGLE_PRIVATE_KEY");
  requireEnv("GOOGLE_SHEET_ID");
}

/**
 * Test Google Sheets connectivity — reads Pending_Orders header row.
 */
export async function testGoogleSheetsConnection(): Promise<{
  spreadsheetId: string;
  tab: string;
  rowCount: number;
  serviceAccountEmail: string;
}> {
  assertGoogleSheetsConfigured();
  const sheets = createSheetsClient();
  const config = getSheetConfig();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: `${config.pendingOrdersTab}!A:J`,
    });

    const rows = response.data.values ?? [];

    return {
      spreadsheetId: config.spreadsheetId,
      tab: config.pendingOrdersTab,
      rowCount: Math.max(0, rows.length - 1),
      serviceAccountEmail: requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    };
  } catch (err) {
    throw new Error(formatGoogleError(err));
  }
}

/** Read existing sheet rows as a Set of "shopifyOrderId:sku" keys */
export async function getSheetOrderSkuKeys(): Promise<Set<string>> {
  const sheets = createSheetsClient();
  const config = getSheetConfig();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.pendingOrdersTab}!A2:J`,
  });

  const keys = new Set<string>();

  for (const cells of response.data.values ?? []) {
    const shopifyOrderId = cells[1];
    const sku = cells[2];
    if (shopifyOrderId && sku) {
      keys.add(`${shopifyOrderId}:${sku}`);
    }
  }

  return keys;
}

/** Append a new order row to the Pending_Orders tab */
export async function appendPendingOrder(
  row: SupplierPendingOrderRow,
): Promise<void> {
  assertGoogleSheetsConfigured();
  const sheets = createSheetsClient();
  const config = getSheetConfig();

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: `${config.pendingOrdersTab}!A:J`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          [
            row.order_number,
            row.shopify_order_id,
            row.sku,
            row.quantity,
            row.customer_name,
            row.shipping_address,
            row.status,
            row.tracking_number,
            row.carrier,
            row.created_at,
          ],
        ],
      },
    });
  } catch (err) {
    throw new Error(
      `${formatGoogleError(err)} | Tab: ${config.pendingOrdersTab} | ` +
        `Share spreadsheet with ${requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL")} as Editor.`,
    );
  }
}

/** Append rows only if (shopify_order_id, sku) not already in sheet */
export async function appendPendingOrderIfMissing(
  row: SupplierPendingOrderRow,
  existingKeys?: Set<string>,
): Promise<boolean> {
  const keys = existingKeys ?? (await getSheetOrderSkuKeys());
  const key = `${row.shopify_order_id}:${row.sku}`;

  if (keys.has(key)) {
    return false;
  }

  await appendPendingOrder(row);
  keys.add(key);
  return true;
}

/** Read Processing rows with tracking numbers (includes sheet row index) */
export async function getProcessingOrdersWithTracking(): Promise<
  SupplierPendingOrderSheetRow[]
> {
  const sheets = createSheetsClient();
  const config = getSheetConfig();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.pendingOrdersTab}!A2:J`,
  });

  const rows = response.data.values ?? [];

  return rows
    .map((cells, index): SupplierPendingOrderSheetRow | null => {
      const [
        order_number,
        shopify_order_id,
        sku,
        quantity,
        customer_name,
        shipping_address,
        status,
        tracking_number,
        carrier,
        created_at,
      ] = cells;

      if (
        !order_number ||
        !shopify_order_id ||
        status !== "Processing" ||
        !tracking_number ||
        String(tracking_number).trim() === ""
      ) {
        return null;
      }

      return {
        order_number: String(order_number),
        shopify_order_id: Number(shopify_order_id),
        sku: String(sku ?? ""),
        quantity: Number(quantity ?? 0),
        customer_name: String(customer_name ?? ""),
        shipping_address: String(shipping_address ?? ""),
        status: "Processing",
        tracking_number: String(tracking_number).trim(),
        carrier: String(carrier ?? "").trim(),
        created_at: String(created_at ?? ""),
        sheetRowIndex: index + 2,
      };
    })
    .filter((row): row is SupplierPendingOrderSheetRow => row !== null);
}

/** Mark multiple sheet rows as Shipped (column G) */
export async function markSheetRowsShipped(
  sheetRowIndices: number[],
): Promise<void> {
  if (sheetRowIndices.length === 0) {
    return;
  }

  const sheets = createSheetsClient();
  const config = getSheetConfig();

  // Batch update avoids rate limits when an order has multiple SKU rows
  const data = sheetRowIndices.map((rowIndex) => ({
    range: `${config.pendingOrdersTab}!G${rowIndex}`,
    values: [["Shipped"]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data,
    },
  });
}

/** Update a sheet row status (e.g. Processing → Shipped) */
export async function updateOrderStatus(
  rowIndex: number,
  status: "Shipped" | "Cancelled",
): Promise<void> {
  const sheets = createSheetsClient();
  const config = getSheetConfig();

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.pendingOrdersTab}!G${rowIndex}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[status]],
    },
  });
}

export { diagnoseGoogleSheets } from "@/lib/supplier/google-auth";
