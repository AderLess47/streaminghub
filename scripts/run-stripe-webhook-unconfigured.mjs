#!/usr/bin/env node
/**
 * Führt `scripts/stripe-webhook-unconfigured.test.ts` in einem eigenen Prozess
 * ohne Stripe-Variablen aus. Wird von `npm run test:stripe-webhook` nach dem
 * konfigurierten Lauf gestartet.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), "streaminghub-stripe-unconfigured-"));
const bundle = path.join(workDir, "stripe-unconfigured.mjs");
const databasePath = path.join(workDir, "test.db");
const fakes = path.join(repoRoot, "scripts", "fakes", "api.ts");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      path.join(repoRoot, "scripts", "stripe-webhook-unconfigured.test.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--alias:@/lib/api=${fakes}`,
      `--alias:@=${path.join(repoRoot, "src")}`,
      `--outfile=${bundle}`,
      "--log-level=warning",
    ],
    { cwd: repoRoot, stdio: "inherit" },
  );

  if (esbuild.status !== 0) {
    console.error("\nBündeln fehlgeschlagen.");
    process.exit(esbuild.status ?? 1);
  }

  const env = { ...process.env, DATABASE_PATH: databasePath, NODE_ENV: "test" };
  delete env.STRIPE_SECRET_KEY;
  delete env.STRIPE_PRICE_ID;
  delete env.STRIPE_WEBHOOK_SECRET;

  const run = spawnSync(process.execPath, [bundle], { cwd: repoRoot, stdio: "inherit", env });
  process.exit(run.status ?? 1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
