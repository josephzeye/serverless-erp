import { describe, expect, it } from "vitest";
import {
  getBaseCurrency,
  getExchangeRateToBase,
  roundMoney,
} from "@/lib/finance/exchange-rates";

describe("exchange-rates", () => {
  it("returns 1 for base currency", async () => {
    expect(await getExchangeRateToBase("USD")).toBe(1);
  });

  it("returns static rate for supported currencies", async () => {
    expect(await getExchangeRateToBase("EUR")).toBe(1.08);
    expect(await getExchangeRateToBase("GBP")).toBe(1.27);
  });

  it("rounds money to two decimal places", () => {
    expect(roundMoney(10.126)).toBe(10.13);
    expect(roundMoney(10.124)).toBe(10.12);
  });

  it("defaults base currency to USD", () => {
    expect(getBaseCurrency()).toBe("USD");
  });
});
