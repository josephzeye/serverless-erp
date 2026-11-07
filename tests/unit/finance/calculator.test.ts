import { afterEach, describe, expect, it } from "vitest";
import { calculateOrderProfit } from "@/lib/finance/calculator";

const ENV_BACKUP = { ...process.env };

afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

describe("calculateOrderProfit", () => {
  it("calculates USD order with explicit supplier cost", async () => {
    process.env.SHOPIFY_PLATFORM_FEE_RATE = "0.029";
    process.env.SHOPIFY_PLATFORM_FEE_FIXED = "0.30";
    process.env.BASE_CURRENCY = "USD";

    const result = await calculateOrderProfit({
      orderId: "test-order-1",
      currency: "USD",
      totalPrice: 100,
      lineItems: [
        { sku: "SKU-A", quantity: 2, unitPrice: 50, unitSupplierCost: 20 },
      ],
    });

    expect(result.grossAmount).toBe(100);
    expect(result.supplierCost).toBe(40);
    expect(result.platformFee).toBe(3.2);
    expect(result.netProfit).toBe(56.8);
    expect(result.exchangeRate).toBe(1);
    expect(result.baseCurrency).toBe("USD");
  });

  it("uses ratio fallback when unit_supplier_cost is zero", async () => {
    process.env.SUPPLIER_COST_RATIO = "0.55";
    process.env.SHOPIFY_PLATFORM_FEE_RATE = "0.029";
    process.env.SHOPIFY_PLATFORM_FEE_FIXED = "0.30";

    const result = await calculateOrderProfit({
      orderId: "test-order-2",
      currency: "USD",
      totalPrice: 100,
      lineItems: [
        { sku: "SKU-B", quantity: 1, unitPrice: 100, unitSupplierCost: 0 },
      ],
    });

    expect(result.supplierCost).toBe(55);
    expect(result.netProfit).toBe(41.8);
  });

  it("normalizes EUR to USD with static exchange rate", async () => {
    process.env.BASE_CURRENCY = "USD";
    process.env.SHOPIFY_PLATFORM_FEE_RATE = "0.029";
    process.env.SHOPIFY_PLATFORM_FEE_FIXED = "0.30";

    const result = await calculateOrderProfit({
      orderId: "test-order-3",
      currency: "EUR",
      totalPrice: 100,
      lineItems: [
        { sku: "SKU-C", quantity: 1, unitPrice: 100, unitSupplierCost: 30 },
      ],
    });

    expect(result.grossAmount).toBe(108);
    expect(result.supplierCost).toBe(30);
    expect(result.exchangeRate).toBe(1.08);
    expect(result.netProfit).toBe(Math.round(result.netProfit * 100) / 100);
    expect(result.platformFee).toBe(3.43);
  });

  it("keeps two-decimal precision for all monetary fields", async () => {
    const result = await calculateOrderProfit({
      orderId: "test-order-4",
      currency: "USD",
      totalPrice: 33.33,
      lineItems: [
        { sku: "SKU-D", quantity: 3, unitPrice: 11.11, unitSupplierCost: 4.17 },
      ],
    });

    for (const value of [
      result.grossAmount,
      result.supplierCost,
      result.platformFee,
      result.netProfit,
    ]) {
      expect(value).toBe(Math.round(value * 100) / 100);
    }
  });
});
