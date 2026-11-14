#!/usr/bin/env node
/**
 * Führt die Resend-Webhook-Tests aus.
 *
 * `configured` prüft Signatur und Ereignisse mit gesetztem Secret,
 * `unconfigured` den 503-Fall in einem eigenen Prozess ohne Secret.
 *
 * Aufruf: npm run test:resend-webhook
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const variant = process.argv[2] === "unconfigured" ? "unconfigured" : "configured";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), `streaminghub-resend-${variant}-`));
const bundle = path.join(workDir, "resend-webhook.mjs");
const databasePath = path.join(workDir, "test.db");
const entry =
  variant === "unconfigured"
    ? path.join(repoRoot, "scripts", "resend-webhook-unconfigured.test.ts")
    : path.join(repoRoot, "scripts", "resend-webhook-routes.test.ts");
const nextServer = path.join(repoRoot, "scripts", "fakes", "next-server.ts");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      entry,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--alias:next/server=${nextServer}`,
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
  if (variant === "unconfigured") {
    delete env.EMAIL_WEBHOOK_SECRET;
    delete env.RESEND_WEBHOOK_SECRET;
  }

  const run = spawnSync(process.execPath, [bundle], { cwd: repoRoot, stdio: "inherit", env });
  process.exit(run.status ?? 1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
