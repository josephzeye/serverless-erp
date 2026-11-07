import { NextRequest, NextResponse } from "next/server";
import {
  syncOrdersFromShopify,
  SyncOrdersError,
} from "@/lib/shopify/sync-orders";
import { verifyCronSecret } from "@/lib/utils/hmac";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-orders
 *
 * Poll Shopify GraphQL → Supabase + Google Sheets.
 * Works from localhost — no Webhook public URL required.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const isDev = process.env.NODE_ENV === "development";
    const cronSecret = process.env.CRON_SECRET;

    if (!isDev && !verifyCronSecret(authHeader)) {
      const body: ApiErrorResponse = {
        success: false,
        error: "Unauthorized cron request",
        code: "UNAUTHORIZED",
      };
      return NextResponse.json(body, { status: 401 });
    }

    if (isDev && cronSecret && authHeader && !verifyCronSecret(authHeader)) {
      const body: ApiErrorResponse = {
        success: false,
        error: "Invalid CRON_SECRET",
        code: "UNAUTHORIZED",
      };
      return NextResponse.json(body, { status: 401 });
    }

    const result = await syncOrdersFromShopify();

    const body: ApiSuccessResponse<typeof result> = {
      success: true,
      data: result,
    };

    return NextResponse.json(body);
  } catch (error) {
    console.error("[cron/sync-orders] Error:", error);

    const phase =
      error instanceof SyncOrdersError ? error.phase : "unknown";
    const message =
      error instanceof Error ? error.message : "Internal server error";

    const body: ApiErrorResponse = {
      success: false,
      error: `[${phase}] ${message}`,
      code: "INTERNAL_ERROR",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
