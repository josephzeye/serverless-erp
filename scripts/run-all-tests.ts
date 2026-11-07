/**
 * Run unit → integration → load tests sequentially and merge report.
 *
 * Usage:
 *   npm run test:all
 *   Requires dev server for integration/load (or set TEST_BASE_URL to deployed URL)
 */
import { spawnSync } from "node:child_process";

const steps = [
  { name: "Unit tests (Vitest)", cmd: "npm", args: ["run", "test:unit"] },
  {
    name: "Integration tests",
    cmd: "npm",
    args: ["run", "test:integration"],
    optional: true,
  },
  {
    name: "Load test",
    cmd: "npm",
    args: ["run", "test:load"],
    optional: true,
  },
];

let failed = false;

console.log("=== Serverless ERP — Full Test Suite ===\n");

for (const step of steps) {
  console.log(`--- ${step.name} ---`);
  const result = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    if (step.optional) {
      console.warn(`⚠ ${step.name} failed (optional — is dev server running?)\n`);
    } else {
      console.error(`✗ ${step.name} failed\n`);
      failed = true;
    }
  } else {
    console.log(`✓ ${step.name} passed\n`);
  }
}

console.log("Reports saved under doc/test-results/");
process.exit(failed ? 1 : 0);
