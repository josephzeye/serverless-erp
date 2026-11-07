import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Shopify webhook HMAC SHA-256 signature.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @see https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
export function verifyShopifyWebhookHmac(
  rawBody: string | Buffer,
  hmacHeader: string,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) {
    return false;
  }

  const bodyBuffer =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;

  const computedHmac = createHmac("sha256", secret)
    .update(bodyBuffer)
    .digest("base64");

  const computedBuffer = Buffer.from(computedHmac, "utf8");
  const headerBuffer = Buffer.from(hmacHeader, "utf8");

  // Length mismatch means invalid signature — skip timingSafeEqual
  if (computedBuffer.length !== headerBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedBuffer, headerBuffer);
}

/**
 * Verify Vercel Cron authorization header.
 * Cron jobs send: Authorization: Bearer <CRON_SECRET>
 */
export function verifyCronSecret(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) {
    return false;
  }

  const expected = `Bearer ${cronSecret}`;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const headerBuffer = Buffer.from(authHeader, "utf8");

  if (expectedBuffer.length !== headerBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, headerBuffer);
}
