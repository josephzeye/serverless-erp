import {
  getBaseCurrency,
  getExchangeRateToBase,
  roundMoney,
} from "@/lib/finance/exchange-rates";
import type { CurrencyCode } from "@/types";

export interface OrderFinancialInput {
  orderId: string;
  currency: CurrencyCode;
  totalPrice: number;
  lineItems: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
    /** Wholesale cost per unit in BASE_CURRENCY (USD) */
    unitSupplierCost: number;
  }>;
}

export interface OrderProfitBreakdown {
  grossAmount: number;
  supplierCost: number;
  platformFee: number;
  netProfit: number;
  exchangeRate: number;
  baseCurrency: CurrencyCode;
}

function getPlatformFeeConfig(): { rate: number; fixedUsd: number } {
  return {
    rate: Number(process.env.SHOPIFY_PLATFORM_FEE_RATE ?? "0.029"),
    fixedUsd: Number(process.env.SHOPIFY_PLATFORM_FEE_FIXED ?? "0.30"),
  };
}

function getSupplierCostRatioFallback(): number {
  return Number(process.env.SUPPLIER_COST_RATIO ?? "0.55");
}

/**
 * Calculate per-order profit normalized to BASE_CURRENCY (USD).
 *
 * gross       = order total converted to USD
 * supplier    = Σ(qty × unit_supplier_cost USD) or estimated from unit_price
 * platform    = Shopify fee (2.9% + $0.30 default)
 * net_profit  = gross − supplier − platform  (all USD, 2 decimal places)
 */
export async function calculateOrderProfit(
  input: OrderFinancialInput,
): Promise<OrderProfitBreakdown> {
  const baseCurrency = getBaseCurrency();
  const exchangeRate = await getExchangeRateToBase(input.currency);
  const ratioFallback = getSupplierCostRatioFallback();
  const { rate: feeRate, fixedUsd: feeFixedUsd } = getPlatformFeeConfig();

  const grossUsd = roundMoney(input.totalPrice * exchangeRate);

  let supplierUsd = 0;
  for (const item of input.lineItems) {
    if (item.unitSupplierCost > 0) {
      supplierUsd += item.quantity * item.unitSupplierCost;
    } else {
      supplierUsd += item.quantity * item.unitPrice * ratioFallback * exchangeRate;
    }
  }
  supplierUsd = roundMoney(supplierUsd);

  const platformUsd = roundMoney(grossUsd * feeRate + feeFixedUsd);
  const netProfitUsd = roundMoney(grossUsd - supplierUsd - platformUsd);

  return {
    grossAmount: grossUsd,
    supplierCost: supplierUsd,
    platformFee: platformUsd,
    netProfit: netProfitUsd,
    exchangeRate: roundMoney(exchangeRate),
    baseCurrency,
  };
}
