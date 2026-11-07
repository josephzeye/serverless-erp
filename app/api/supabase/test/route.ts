import { NextResponse } from "next/server";
import { diagnoseSupabase } from "@/lib/network/supabase-diagnostics";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/supabase/test — Supabase connectivity diagnostics */
export async function GET() {
  try {
    const data = await diagnoseSupabase();

    const body: ApiSuccessResponse<typeof data> = {
      success: true,
      data,
    };

    return NextResponse.json(body, {
      status: data.query.ok ? 200 : 503,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Supabase test failed";
    const body: ApiErrorResponse = {
      success: false,
      error: message,
      code: "SUPABASE_ERROR",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
