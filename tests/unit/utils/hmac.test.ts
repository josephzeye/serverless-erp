import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyCronSecret, verifyShopifyWebhookHmac } from "@/lib/utils/hmac";

const ENV_BACKUP = { ...process.env };

afterEach(() => {
  process.env = { ...ENV_BACKUP };
});

function signWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyShopifyWebhookHmac", () => {
  it("accepts valid HMAC signature", () => {
    const secret = "test-webhook-secret";
    const body = JSON.stringify({ id: 1001, name: "#1001" });
    const hmac = signWebhook(body, secret);

    expect(verifyShopifyWebhookHmac(body, hmac, secret)).toBe(true);
  });

  it("rejects tampered body", () => {
    const secret = "test-webhook-secret";
    const body = JSON.stringify({ id: 1001 });
    const hmac = signWebhook(body, secret);

    expect(
      verifyShopifyWebhookHmac(
        JSON.stringify({ id: 1002 }),
        hmac,
        secret,
      ),
    ).toBe(false);
  });

  it("rejects empty header or secret", () => {
    expect(verifyShopifyWebhookHmac("{}", "", "secret")).toBe(false);
    expect(verifyShopifyWebhookHmac("{}", "abc", "")).toBe(false);
  });
});

describe("verifyCronSecret", () => {
  it("accepts matching bearer token", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    expect(verifyCronSecret("Bearer cron-test-secret")).toBe(true);
  });

  it("rejects wrong token", () => {
    process.env.CRON_SECRET = "cron-test-secret";
    expect(verifyCronSecret("Bearer wrong")).toBe(false);
    expect(verifyCronSecret(null)).toBe(false);
  });
});
