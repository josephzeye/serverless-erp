import { describe, expect, it } from "vitest";
import {
  formatAddressForSheetWithFallback,
  formatCustomerNameForSheet,
  mapShopifyFulfillmentStatus,
  normalizeCurrency,
  parseOrderWebhookPayload,
  resolveLineItemSku,
} from "@/lib/shopify/mappers";

const minimalOrderPayload = {
  id: 5001,
  name: "#5001",
  order_number: 5001,
  currency: "USD",
  total_price: "99.00",
  financial_status: "paid",
  fulfillment_status: "unfulfilled",
  line_items: [
    {
      id: 1,
      sku: "DEMO-SKU-001",
      quantity: 1,
      price: "99.00",
      title: "Demo Product",
      variant_id: 100,
      product_id: 200,
    },
  ],
  shipping_address: null,
  created_at: "2026-08-15T10:00:00Z",
  updated_at: "2026-08-15T10:00:00Z",
};

describe("parseOrderWebhookPayload", () => {
  it("parses valid Shopify order payload", () => {
    const parsed = parseOrderWebhookPayload(minimalOrderPayload);
    expect(parsed.id).toBe(5001);
    expect(parsed.name).toBe("#5001");
    expect(parsed.line_items).toHaveLength(1);
  });

  it("throws on invalid payload", () => {
    expect(() => parseOrderWebhookPayload(null)).toThrow();
    expect(() => parseOrderWebhookPayload({ id: "bad" })).toThrow();
  });
});

describe("mapShopifyFulfillmentStatus", () => {
  it("maps cancelled topic", () => {
    expect(mapShopifyFulfillmentStatus("unfulfilled", "orders/cancelled")).toBe(
      "cancelled",
    );
  });

  it("maps fulfilled to shipped", () => {
    expect(mapShopifyFulfillmentStatus("fulfilled", "orders/updated")).toBe(
      "shipped",
    );
  });

  it("maps new order to processing", () => {
    expect(mapShopifyFulfillmentStatus("unfulfilled", "orders/create")).toBe(
      "processing",
    );
  });
});

describe("normalizeCurrency", () => {
  it("accepts supported currencies", () => {
    expect(normalizeCurrency("eur")).toBe("EUR");
  });

  it("falls back to USD for unknown currency", () => {
    expect(normalizeCurrency("JPY")).toBe("USD");
  });
});

describe("PII fallbacks (Basic plan)", () => {
  it("uses order name when customer name missing", () => {
    expect(
      formatCustomerNameForSheet(
        {
          first_name: "",
          last_name: "",
          address1: "",
          city: "",
          province: "",
          country: "",
          zip: "",
        },
        "#5001",
      ),
    ).toBe("Customer (#5001)");
  });

  it("uses placeholder when address missing", () => {
    expect(
      formatAddressForSheetWithFallback(
        {
          first_name: "",
          last_name: "",
          address1: "",
          city: "",
          province: "",
          country: "",
          zip: "",
        },
        "#5001",
      ),
    ).toContain("PII restricted");
  });
});

describe("resolveLineItemSku", () => {
  it("prefers non-empty sku", () => {
    expect(resolveLineItemSku(" ABC ", 1)).toBe("ABC");
  });

  it("falls back to variant id", () => {
    expect(resolveLineItemSku(null, 12345)).toBe("VARIANT-12345");
  });

  it("returns NO-SKU when both missing", () => {
    expect(resolveLineItemSku(null, null)).toBe("NO-SKU");
  });
});
