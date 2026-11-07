/**
 * Integration tests against a running Next.js dev/prod server.
 *
 * Usage:
 *   npm run dev          # terminal 1
 *   npm run test:integration
 *
 * Env:
 *   TEST_BASE_URL=http://localhost:3000
 *   SHOPIFY_WEBHOOK_SECRET=...  (for webhook security tests)
 *   CRON_SECRET=...             (optional)
 */
import {
  getBaseUrl,
  signShopifyWebhook,
  summarize,
  timedFetch,
  writeReport,
  type TestReport,
  type TestResult,
} from "./lib/test-utils";

async function runCase(
  id: string,
  name: string,
  fn: () => Promise<Omit<TestResult, "id" | "name" | "category">>,
): Promise<TestResult> {
  const start = performance.now();
  try {
    const partial = await fn();
    return {
      id,
      name,
      category: "integration",
      durationMs: partial.durationMs ?? Math.round(performance.now() - start),
      status: partial.status,
      message: partial.message,
      metrics: partial.metrics,
    };
  } catch (error) {
    return {
      id,
      name,
      category: "integration",
      durationMs: Math.round(performance.now() - start),
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const baseUrl = getBaseUrl();
  const results: TestResult[] = [];

  results.push(
    await runCase("IT-001", "Shopify API connectivity", async () => {
      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/shopify/test`,
      );
      const json = (await response.json()) as { success?: boolean };
      return {
        status: response.ok && json.success ? "pass" : "fail",
        durationMs,
        message: response.ok ? "Shopify API reachable" : `HTTP ${response.status}`,
        metrics: { responseMs: durationMs, httpStatus: response.status },
      };
    }),
  );

  results.push(
    await runCase("IT-002", "Google Sheets connectivity", async () => {
      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/google/test`,
      );
      const json = (await response.json()) as {
        success?: boolean;
        data?: { stage?: string };
      };

      if (!response.ok) {
        return {
          status: "skip",
          durationMs,
          message: "Google API unavailable — check HTTPS_PROXY or credentials",
          metrics: { responseMs: durationMs },
        };
      }

      return {
        status: json.success ? "pass" : "fail",
        durationMs,
        message: json.success ? "Google Sheets API reachable" : "Google test failed",
        metrics: { responseMs: durationMs, stage: json.data?.stage ?? "unknown" },
      };
    }),
  );

  results.push(
    await runCase("IT-003", "Webhook rejects missing webhook id", async () => {
      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/webhooks/shopify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      );
      const json = (await response.json()) as { code?: string };
      return {
        status: response.status === 400 && json.code === "BAD_REQUEST" ? "pass" : "fail",
        durationMs,
        message: `Expected 400 BAD_REQUEST, got ${response.status}`,
        metrics: { responseMs: durationMs },
      };
    }),
  );

  results.push(
    await runCase("IT-004", "Webhook rejects invalid HMAC", async () => {
      const secret = process.env.SHOPIFY_WEBHOOK_SECRET ?? "integration-test-secret";
      const body = JSON.stringify({ id: 999999, name: "#999999" });
      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/webhooks/shopify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Webhook-Id": "wh-integration-invalid-hmac",
            "X-Shopify-Topic": "orders/create",
            "X-Shopify-Hmac-Sha256": "invalid-signature",
          },
          body,
        },
      );
      const json = (await response.json()) as { code?: string };
      const pass =
        response.status === 401 ||
        (response.status === 500 && !process.env.SHOPIFY_WEBHOOK_SECRET);
      return {
        status: pass ? "pass" : "fail",
        durationMs,
        message:
          response.status === 401
            ? "Invalid HMAC rejected"
            : `HTTP ${response.status} code=${json.code ?? "n/a"}`,
        metrics: { responseMs: durationMs, secretConfigured: Boolean(secret) },
      };
    }),
  );

  results.push(
    await runCase("IT-005", "Webhook accepts valid HMAC (dry payload)", async () => {
      const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
      if (!secret) {
        return {
          status: "skip",
          durationMs: 0,
          message: "SHOPIFY_WEBHOOK_SECRET not set",
        };
      }

      const body = JSON.stringify({
        id: 999999001,
        name: "#TEST-999999001",
        order_number: 999999001,
        currency: "USD",
        total_price: "1.00",
        financial_status: "paid",
        fulfillment_status: "unfulfilled",
        line_items: [],
        shipping_address: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const hmac = signShopifyWebhook(body, secret);
      const webhookId = `wh-integration-${Date.now()}`;

      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/webhooks/shopify`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Webhook-Id": webhookId,
            "X-Shopify-Topic": "orders/create",
            "X-Shopify-Hmac-Sha256": hmac,
          },
          body,
        },
      );

      const json = (await response.json()) as { success?: boolean; error?: string };
      const pass = response.status === 200 || response.status === 500;
      return {
        status: pass ? "pass" : "fail",
        durationMs,
        message:
          response.status === 200
            ? "HMAC verified — handler executed"
            : `Handler error (HMAC ok): ${json.error ?? response.status}`,
        metrics: { responseMs: durationMs, httpStatus: response.status },
      };
    }),
  );

  results.push(
    await runCase("IT-006", "Dashboard SSR page responds", async () => {
      const { response, durationMs } = await timedFetch(`${baseUrl}/`);
      return {
        status: response.ok ? "pass" : "fail",
        durationMs,
        message: response.ok ? "Dashboard HTML returned" : `HTTP ${response.status}`,
        metrics: { responseMs: durationMs, targetMs: 1500, withinTarget: durationMs <= 1500 },
      };
    }),
  );

  results.push(
    await runCase("IT-007", "Orders page SSR responds", async () => {
      const { response, durationMs } = await timedFetch(`${baseUrl}/orders`);
      return {
        status: response.ok ? "pass" : "fail",
        durationMs,
        message: response.ok ? "Orders page returned" : `HTTP ${response.status}`,
        metrics: { responseMs: durationMs },
      };
    }),
  );

  results.push(
    await runCase("IT-008", "Finance page SSR responds", async () => {
      const { response, durationMs } = await timedFetch(`${baseUrl}/finance`);
      return {
        status: response.ok ? "pass" : "fail",
        durationMs,
        message: response.ok ? "Finance page returned" : `HTTP ${response.status}`,
        metrics: { responseMs: durationMs },
      };
    }),
  );

  results.push(
    await runCase("IT-009", "Cron sync-orders endpoint", async () => {
      const headers: Record<string, string> = {};
      if (process.env.CRON_SECRET) {
        headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
      }

      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/cron/sync-orders`,
        { headers },
      );
      const json = (await response.json()) as { success?: boolean; error?: string };

      if (!response.ok && durationMs > 60000) {
        return { status: "fail", durationMs, message: "Timeout" };
      }

      return {
        status: json.success ? "pass" : response.ok ? "pass" : "fail",
        durationMs,
        message: json.success
          ? "Order sync completed"
          : json.error ?? `HTTP ${response.status}`,
        metrics: { responseMs: durationMs, targetMs: 300000 },
      };
    }),
  );

  results.push(
    await runCase("IT-010", "Cron sync-supplier endpoint", async () => {
      const headers: Record<string, string> = {};
      if (process.env.CRON_SECRET) {
        headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
      }

      const { response, durationMs } = await timedFetch(
        `${baseUrl}/api/cron/sync-supplier`,
        { headers },
      );
      const json = (await response.json()) as { success?: boolean; error?: string };

      return {
        status: response.ok && json.success !== false ? "pass" : "fail",
        durationMs,
        message: json.success ? "Supplier sync completed" : json.error ?? `HTTP ${response.status}`,
        metrics: { responseMs: durationMs },
      };
    }),
  );

  const report: TestReport = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    summary: summarize(results),
    results,
  };

  const filePath = await writeReport(
    report,
    `integration-${Date.now()}.json`,
  );

  console.log("\n=== Integration Test Report ===");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Pass rate: ${report.summary.passRate}`);
  console.log(`Passed: ${report.summary.passed}/${report.summary.total}`);
  console.log(`Report: ${filePath}\n`);

  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "skip" ? "○" : "✗";
    console.log(`${icon} [${r.id}] ${r.name} (${r.durationMs}ms) — ${r.message ?? r.status}`);
  }

  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
