import { NextResponse } from "next/server";
import { fetchShopInfo, fetchShopifyOrders } from "@/lib/shopify/fetch-orders";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shopify/test
 * Verify Custom App API credentials from localhost (no public URL needed).
 */
export async function GET() {
  try {
    const shop = await fetchShopInfo();
    const orders = await fetchShopifyOrders({ first: 5 });

    const body: ApiSuccessResponse<{
      shop: typeof shop;
      openOrdersPreview: number;
      sampleOrderNames: string[];
      apiVersion: string;
      piiMode: string;
    }> = {
      success: true,
      data: {
        shop,
        openOrdersPreview: orders.length,
        sampleOrderNames: orders.slice(0, 5).map((o) => o.name),
        apiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-07",
        piiMode:
          process.env.SHOPIFY_INCLUDE_PII === "true"
            ? "enabled (Advanced/Plus)"
            : "disabled (Basic plan safe)",
      },
    };

    return NextResponse.json(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopify API test failed";
    const body: ApiErrorResponse = {
      success: false,
      error: message,
      code: "SHOPIFY_API_ERROR",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
