import { NextRequest, NextResponse } from "next/server";
import { dispatchShopifyWebhook } from "@/lib/shopify/webhook-handlers";
import { verifyShopifyWebhookHmac } from "@/lib/utils/hmac";
import type { ApiErrorResponse, ApiSuccessResponse } from "@/types";

export const runtime = "nodejs";

/** Shopify requires raw body for HMAC — disable Next.js body parsing */
export const dynamic = "force-dynamic";

interface WebhookSuccessData {
  topic: string;
  webhookId: string;
  duplicate: boolean;
  orderId?: string;
  shopifyOrderId?: number;
  message: string;
}

/**
 * Shopify Webhook receiver.
 *
 * Security: HMAC SHA-256 via X-Shopify-Hmac-Sha256
 * Idempotency: webhook_events.shopify_webhook_id + orders.shopify_order_id UNIQUE
 * Flow (orders/create): Supabase insert → reserve inventory → Google Sheets append
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const hmacHeader = request.headers.get("x-shopify-hmac-sha256") ?? "";
    const topic = request.headers.get("x-shopify-topic") ?? "";
    const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";

    if (!webhookId) {
      const body: ApiErrorResponse = {
        success: false,
        error: "Missing X-Shopify-Webhook-Id header",
        code: "BAD_REQUEST",
      };
      return NextResponse.json(body, { status: 400 });
    }

    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      const body: ApiErrorResponse = {
        success: false,
        error: "Webhook secret not configured",
        code: "CONFIG_ERROR",
      };
      return NextResponse.json(body, { status: 500 });
    }

    // Reject requests with invalid HMAC signature
    if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
      const body: ApiErrorResponse = {
        success: false,
        error: "Invalid webhook signature",
        code: "UNAUTHORIZED",
      };
      return NextResponse.json(body, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      const body: ApiErrorResponse = {
        success: false,
        error: "Invalid JSON body",
        code: "BAD_REQUEST",
      };
      return NextResponse.json(body, { status: 400 });
    }

    const result = await dispatchShopifyWebhook({
      webhookId,
      topic,
      rawPayload: payload,
    });

    const body: ApiSuccessResponse<WebhookSuccessData> = {
      success: true,
      data: {
        topic,
        webhookId,
        duplicate: result.duplicate,
        orderId: result.orderId,
        shopifyOrderId: result.shopifyOrderId,
        message: result.message,
      },
    };

    // Always 200 for duplicates — prevents Shopify retry storms
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error("[shopify/webhook] Unhandled error:", error);

    const message =
      error instanceof Error ? error.message : "Internal server error";
    const body: ApiErrorResponse = {
      success: false,
      error: message,
      code: "INTERNAL_ERROR",
    };
    // 500 triggers Shopify retry for transient failures
    return NextResponse.json(body, { status: 500 });
  }
}
