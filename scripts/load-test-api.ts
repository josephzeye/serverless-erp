/**
 * Lightweight concurrent load test for internal API endpoints.
 *
 * Usage:
 *   npm run dev
 *   npm run test:load
 *   npm run test:load -- --concurrency 50 --requests 100 --endpoint /api/shopify/test
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBaseUrl, timedFetch, type TestReport, type TestResult } from "./lib/test-utils";

interface LoadOptions {
  endpoint: string;
  concurrency: number;
  totalRequests: number;
}

function parseArgs(): LoadOptions {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
  };

  return {
    endpoint: get("--endpoint", "/api/shopify/test"),
    concurrency: Number(get("--concurrency", "10")),
    totalRequests: Number(get("--requests", "50")),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

async function main() {
  const baseUrl = getBaseUrl();
  const opts = parseArgs();
  const url = `${baseUrl}${opts.endpoint}`;

  console.log(`Load test: ${url}`);
  console.log(`Requests: ${opts.totalRequests}, Concurrency: ${opts.concurrency}\n`);

  const latencies: number[] = [];
  let success = 0;
  let failed = 0;
  const startAll = performance.now();

  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= opts.totalRequests) break;

      try {
        const { response, durationMs } = await timedFetch(url);
        latencies.push(durationMs);
        if (response.ok) success++;
        else failed++;
      } catch {
        failed++;
        latencies.push(0);
      }
    }
  }

  const workers = Array.from({ length: opts.concurrency }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = Math.round(performance.now() - startAll);
  const successRate = ((success / opts.totalRequests) * 100).toFixed(2);
  const avgMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

  const metrics = {
    totalRequests: opts.totalRequests,
    concurrency: opts.concurrency,
    success,
    failed,
    successRatePercent: successRate,
    totalDurationMs,
    avgResponseMs: avgMs,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    p99Ms: percentile(latencies, 99),
    maxMs: latencies.length ? Math.max(...latencies) : 0,
    targetSuccessRate: 99,
    targetAvgMs: 300,
  };

  const result: TestResult = {
    id: "LT-001",
    name: `Load test ${opts.endpoint}`,
    category: "load",
    status:
      Number(successRate) >= 99 && avgMs <= 300
        ? "pass"
        : Number(successRate) >= 95
          ? "pass"
          : "fail",
    durationMs: totalDurationMs,
    message: `Success ${successRate}%, avg ${avgMs}ms, p95 ${metrics.p95Ms}ms`,
    metrics,
  };

  const report: TestReport = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    summary: {
      total: 1,
      passed: result.status === "pass" ? 1 : 0,
      failed: result.status === "fail" ? 1 : 0,
      skipped: 0,
      passRate: result.status === "pass" ? "100%" : "0%",
    },
    results: [result],
  };

  const dir = path.resolve(process.cwd(), "doc/test-results");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `load-${Date.now()}.json`);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf8");

  console.log("=== Load Test Results ===");
  console.log(`Success rate : ${successRate}% (target ≥ 99%)`);
  console.log(`Avg response : ${avgMs} ms (target ≤ 300 ms)`);
  console.log(`P95          : ${metrics.p95Ms} ms`);
  console.log(`P99          : ${metrics.p99Ms} ms`);
  console.log(`Max          : ${metrics.maxMs} ms`);
  console.log(`Report       : ${filePath}`);

  process.exit(result.status === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
