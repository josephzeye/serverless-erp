import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface TestResult {
  id: string;
  name: string;
  category: "unit" | "integration" | "load" | "e2e";
  status: "pass" | "fail" | "skip";
  durationMs: number;
  message?: string;
  metrics?: Record<string, number | string | boolean>;
}

export interface TestReport {
  generatedAt: string;
  baseUrl: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: string;
  };
  results: TestResult[];
}

export function getBaseUrl(): string {
  return process.env.TEST_BASE_URL ?? "http://localhost:3000";
}

export function signShopifyWebhook(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

export async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; durationMs: number }> {
  const start = performance.now();
  const response = await fetch(url, init);
  const durationMs = Math.round(performance.now() - start);
  return { response, durationMs };
}

export async function writeReport(
  report: TestReport,
  filename: string,
): Promise<string> {
  const dir = path.resolve(process.cwd(), "doc/test-results");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf8");
  return filePath;
}

export function summarize(results: TestResult[]): TestReport["summary"] {
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const total = results.length;
  const rate = total === 0 ? "0%" : `${((passed / total) * 100).toFixed(1)}%`;

  return {
    total,
    passed,
    failed,
    skipped,
    passRate: rate,
  };
}
