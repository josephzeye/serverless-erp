import type {
  CurrencyCode,
  FulfillmentStatus,
  ShippingAddress,
  ShopifyOrderWebhookPayload,
  ShopifyWebhookAddress,
} from "@/types";

const VALID_CURRENCIES: ReadonlySet<string> = new Set([
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "CNY",
]);

/** Narrow unknown JSON to ShopifyOrderWebhookPayload */
export function parseOrderWebhookPayload(
  raw: unknown,
): ShopifyOrderWebhookPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Webhook body must be a JSON object");
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.id !== "number") {
    throw new Error("Missing or invalid order id");
  }
  if (typeof body.name !== "string") {
    throw new Error("Missing or invalid order name");
  }
  if (typeof body.order_number !== "number") {
    throw new Error("Missing or invalid order_number");
  }
  if (typeof body.currency !== "string") {
    throw new Error("Missing or invalid currency");
  }
  if (typeof body.total_price !== "string") {
    throw new Error("Missing or invalid total_price");
  }
  if (!Array.isArray(body.line_items)) {
    throw new Error("Missing or invalid line_items");
  }

  return body as unknown as ShopifyOrderWebhookPayload;
}

/** Map Shopify fulfillment_status string to internal enum */
export function mapShopifyFulfillmentStatus(
  shopifyStatus: string | null,
  topic: string,
): FulfillmentStatus {
  if (topic === "orders/cancelled") {
    return "cancelled";
  }

  switch (shopifyStatus) {
    case "fulfilled":
      return "shipped";
    case "partial":
      return "processing";
    case "restocked":
      return "cancelled";
    case null:
    case "unfulfilled":
      return topic === "orders/create" ? "processing" : "pending";
    default:
      return "pending";
  }
}

/** Validate and normalize currency code */
export function normalizeCurrency(currency: string): CurrencyCode {
  const upper = currency.toUpperCase();
  if (VALID_CURRENCIES.has(upper)) {
    return upper as CurrencyCode;
  }
  return "USD";
}

/** Convert Shopify address to JSONB shipping_address */
export function mapShippingAddress(
  address: ShopifyWebhookAddress | null,
): ShippingAddress {
  if (!address) {
    return {
      first_name: "",
      last_name: "",
      address1: "",
      city: "",
      province: "",
      country: "",
      zip: "",
    };
  }

  return {
    first_name: address.first_name ?? "",
    last_name: address.last_name ?? "",
    address1: address.address1 ?? "",
    address2: address.address2 ?? undefined,
    city: address.city ?? "",
    province: address.province ?? "",
    country: address.country ?? "",
    zip: address.zip ?? "",
    phone: address.phone ?? undefined,
  };
}

/** Single-line address for Google Sheets supplier row */
export function formatAddressForSheet(address: ShippingAddress): string {
  return [
    address.address1,
    address.address2,
    address.city,
    address.province,
    address.zip,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Customer display name from shipping address */
export function formatCustomerName(address: ShippingAddress): string {
  return [address.first_name, address.last_name].filter(Boolean).join(" ");
}

/** Customer name with fallback when PII unavailable (Basic Shopify plan) */
export function formatCustomerNameForSheet(
  address: ShippingAddress,
  orderName: string,
): string {
  const name = formatCustomerName(address);
  return name || `Customer (${orderName})`;
}

/** Address line with fallback when PII unavailable (Basic Shopify plan) */
export function formatAddressForSheetWithFallback(
  address: ShippingAddress,
  orderName: string,
): string {
  const line = formatAddressForSheet(address);
  if (line) {
    return line;
  }
  return `[PII restricted — view shipping in Shopify Admin for ${orderName}]`;
}

/** Resolve SKU — fallback to variant-based placeholder when missing */
export function resolveLineItemSku(
  sku: string | null,
  variantId: number | null,
): string {
  if (sku && sku.trim().length > 0) {
    return sku.trim();
  }
  if (variantId) {
    return `VARIANT-${variantId}`;
  }
  return "NO-SKU";
}
