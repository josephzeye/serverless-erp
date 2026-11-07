import { NextRequest, NextResponse } from "next/server";
import { backfillOrdersToSheets } from "@/lib/supplier/backfill";
import { verifyCronSecret } from "@/lib/utils/hmac";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/backfill-sheets
 *
 * Push existing Supabase orders to Google Sheets (skips duplicates).
 * Use when orders exist in DB but sheet sync failed or was skipped.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const isDev = process.env.NODE_ENV === "development";
    const cronSecret = process.env.CRON_SECRET;

    if (!isDev && !verifyCronSecret(authHeader)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    if (isDev && cronSecret && authHeader && !verifyCronSecret(authHeader)) {
      return NextResponse.json(
        { success: false, error: "Invalid CRON_SECRET", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const result = await backfillOrdersToSheets();

    const body: ApiSuccessResponse<typeof result> = {
      success: true,
      data: result,
    };

    return NextResponse.json(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backfill failed";
    const body: ApiErrorResponse = {
      success: false,
      error: message,
      code: "GOOGLE_SHEETS_ERROR",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
