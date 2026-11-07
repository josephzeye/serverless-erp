import { NextResponse } from "next/server";
import { diagnoseGoogleSheets } from "@/lib/supplier/google-auth";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/google/test
 * Staged diagnostics: config → network → OAuth → Sheets read.
 */
export async function GET() {
  const diagnostics = await diagnoseGoogleSheets();

  const allOk =
    diagnostics.config.privateKeyValid &&
    diagnostics.network.reachable &&
    diagnostics.auth.ok &&
    diagnostics.sheets.ok;

  if (allOk) {
    const body: ApiSuccessResponse<typeof diagnostics & { hint: string }> = {
      success: true,
      data: {
        ...diagnostics,
        hint: "Google Sheets is ready. Run /api/cron/backfill-sheets to sync existing orders.",
      },
    };
    return NextResponse.json(body);
  }

  const failedStep = !diagnostics.config.privateKeyValid
    ? "config.privateKey"
    : !diagnostics.network.reachable
      ? "network"
      : !diagnostics.auth.ok
        ? "auth"
        : "sheets";

  const errorMessage =
    diagnostics.sheets.error ??
    diagnostics.auth.error ??
    diagnostics.network.hint ??
    diagnostics.network.error ??
    "Configuration invalid";

  const body: ApiErrorResponse & { diagnostics: typeof diagnostics } = {
    success: false,
    error: `[${failedStep}] ${errorMessage}`,
    code: "GOOGLE_SHEETS_ERROR",
    diagnostics,
  };

  return NextResponse.json(body, { status: 500 });
}
