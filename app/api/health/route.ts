import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — lightweight probe for Vercel uptime / load tests.
 * Does not call Shopify or Google APIs.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    service: "serverless-erp",
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL_ENV ?? "development",
  });
}
