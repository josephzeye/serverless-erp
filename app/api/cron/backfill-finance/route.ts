import { NextRequest, NextResponse } from "next/server";
import { backfillFinancialLogs } from "@/lib/finance/record";
import { verifyCronSecret } from "@/lib/utils/hmac";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/backfill-finance
 * Create financial_logs for shipped orders that don't have one yet.
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

    const result = await backfillFinancialLogs();

    const body: ApiSuccessResponse<typeof result> = {
      success: true,
      data: result,
    };

    return NextResponse.json(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Backfill finance failed";
    const body: ApiErrorResponse = {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
