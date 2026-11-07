/**
 * Core 3NF database entities and integration payload types.
 * All modules import from here to maintain a single source of truth.
 */

// =============================================================================
// Enums & Shared Primitives
// =============================================================================

export type FulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "failed";

export type SupplierSheetStatus = "Processing" | "Shipped" | "Cancelled";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "CNY";

// =============================================================================
// 3NF Database Entities
// =============================================================================

/** Shipping address stored as JSONB on orders table */
export interface ShippingAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

/** orders — one row per Shopify order */
export interface Order {
  id: string;
  shopify_order_id: number;
  order_number: string;
  currency: CurrencyCode;
  total_price: number;
  fulfillment_status: FulfillmentStatus;
  shipping_address: ShippingAddress;
  customer_email?: string;
  created_at: string;
  updated_at: string;
}

/** order_items — line items normalized from Shopify order */
export interface OrderItem {
  id: string;
  order_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  product_title: string;
  created_at: string;
}

/** inventory — virtual stock pool keyed by SKU */
export interface Inventory {
  sku: string;
  product_name: string;
  local_stock: number;
  supplier_stock: number;
  reserved_stock: number;
  low_stock_threshold: number;
  unit_supplier_cost: number;
  updated_at: string;
}

/** webhook_events — Shopify webhook idempotency ledger */
export interface WebhookEvent {
  id: string;
  shopify_webhook_id: string;
  topic: string;
  shopify_order_id?: number;
  processed_at: string;
}

/** fulfillments — tracking info synced back to Shopify */
export interface Fulfillment {
  id: string;
  order_id: string;
  tracking_number: string;
  carrier: string;
  synced_to_shopify: boolean;
  created_at: string;
  updated_at: string;
}

/** financial_logs — per-order profit breakdown normalized to base currency */
export interface FinancialLog {
  id: string;
  order_id: string;
  gross_amount: number;
  supplier_cost: number;
  platform_fee: number;
  net_profit: number;
  exchange_rate: number;
  base_currency: CurrencyCode;
  created_at: string;
}

// =============================================================================
// Insert / Update DTOs (omit auto-generated fields)
// =============================================================================

export type OrderInsert = Omit<Order, "id" | "created_at" | "updated_at">;
export type OrderItemInsert = Omit<OrderItem, "id" | "created_at">;
export type InventoryInsert = Omit<Inventory, "updated_at">;
export type FulfillmentInsert = Omit<
  Fulfillment,
  "id" | "created_at" | "updated_at"
>;
export type FinancialLogInsert = Omit<FinancialLog, "id" | "created_at">;

// =============================================================================
// Shopify Webhook Payloads
// =============================================================================

export interface ShopifyWebhookLineItem {
  id: number;
  sku: string | null;
  quantity: number;
  price: string;
  title: string;
  variant_id: number | null;
  product_id: number | null;
}

export interface ShopifyWebhookAddress {
  first_name: string | null;
  last_name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
}

/** Payload for orders/create and orders/updated webhooks */
export interface ShopifyOrderWebhookPayload {
  id: number;
  name: string;
  order_number: number;
  email: string | null;
  currency: string;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: ShopifyWebhookLineItem[];
  shipping_address: ShopifyWebhookAddress | null;
  created_at: string;
  updated_at: string;
}

export type ShopifyWebhookTopic =
  | "orders/create"
  | "orders/updated"
  | "orders/cancelled"
  | "app/uninstalled";

export interface ShopifyWebhookHeaders {
  "x-shopify-topic": ShopifyWebhookTopic;
  "x-shopify-hmac-sha256": string;
  "x-shopify-shop-domain": string;
  "x-shopify-webhook-id": string;
  "x-shopify-api-version": string;
}

// =============================================================================
// Shopify GraphQL Types
// =============================================================================

export interface ShopifyThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

export interface ShopifyGraphQLExtensions {
  cost: {
    requestedQueryCost: number;
    actualQueryCost: number;
    throttleStatus: ShopifyThrottleStatus;
  };
}

export interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  extensions?: ShopifyGraphQLExtensions;
}

export interface ShopifyFulfillmentCreateResult {
  fulfillmentCreate: {
    fulfillment: {
      id: string;
      status: string;
      trackingInfo: Array<{ number: string; company: string }>;
    } | null;
    userErrors: Array<{ field: string[]; message: string }>;
  };
}

// =============================================================================
// Google Sheets — Supplier Integration
// =============================================================================

/** Row schema for Pending_Orders sheet tab */
export interface SupplierPendingOrderRow {
  order_number: string;
  shopify_order_id: number;
  sku: string;
  quantity: number;
  customer_name: string;
  shipping_address: string;
  status: SupplierSheetStatus;
  tracking_number: string;
  carrier: string;
  created_at: string;
}

/** Sheet row with 1-based row index for status updates (row 1 = header) */
export interface SupplierPendingOrderSheetRow extends SupplierPendingOrderRow {
  sheetRowIndex: number;
}

export interface SupplierSheetConfig {
  spreadsheetId: string;
  pendingOrdersTab: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// =============================================================================
// Dashboard Analytics Aggregates
// =============================================================================

export interface FulfillmentStatusBreakdown {
  status: FulfillmentStatus;
  count: number;
}

export interface ProfitSummary {
  total_gross: number;
  total_supplier_cost: number;
  total_platform_fee: number;
  total_net_profit: number;
  base_currency: CurrencyCode;
  order_count: number;
}

export interface InventoryAlert {
  sku: string;
  product_name: string;
  available_stock: number;
  threshold: number;
}

export interface DashboardMetrics {
  fulfillment_breakdown: FulfillmentStatusBreakdown[];
  profit_summary: ProfitSummary;
  profit_by_order: ProfitByOrder[];
  low_stock_items: InventoryAlert[];
  pending_orders_count: number;
}

/** Per-order profit row for dashboard chart */
export interface ProfitByOrder {
  order_number: string;
  gross_amount: number;
  supplier_cost: number;
  platform_fee: number;
  net_profit: number;
  base_currency: CurrencyCode;
}
