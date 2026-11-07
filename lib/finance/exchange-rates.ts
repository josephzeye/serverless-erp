import type { CurrencyCode } from "@/types";

/** Static fallback rates (order currency → USD). Updated periodically for demo. */
const STATIC_RATES_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  CAD: 0.73,
  AUD: 0.65,
  CNY: 0.14,
};

const BASE = (process.env.BASE_CURRENCY ?? "USD") as CurrencyCode;

/**
 * Convert 1 unit of `currency` to BASE_CURRENCY (default USD).
 * Uses EXCHANGE_RATE_API if key present, else static table.
 */
export async function getExchangeRateToBase(
  currency: string,
): Promise<number> {
  const code = currency.toUpperCase() as CurrencyCode;

  if (code === BASE) {
    return 1;
  }

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  if (apiKey) {
    try {
      const rate = await fetchLiveRate(code, BASE, apiKey);
      if (rate > 0) {
        return rate;
      }
    } catch (err) {
      console.warn("[exchange-rates] Live fetch failed, using static:", err);
    }
  }

  const staticRate = STATIC_RATES_TO_USD[code];
  if (staticRate) {
    return staticRate;
  }

  return 1;
}

async function fetchLiveRate(
  from: CurrencyCode,
  to: CurrencyCode,
  apiKey: string,
): Promise<number> {
  const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Exchange rate API HTTP ${response.status}`);
  }

  const json = (await response.json()) as {
    result?: string;
    conversion_rate?: number;
  };

  if (json.result !== "success" || !json.conversion_rate) {
    throw new Error("Exchange rate API returned invalid response");
  }

  return json.conversion_rate;
}

/** Round to 2 decimal places (thesis KPI: precision to cents) */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function getBaseCurrency(): CurrencyCode {
  return BASE;
}
