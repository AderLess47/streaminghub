#!/usr/bin/env node
/**
 * Führt `scripts/store-refresh-routes.test.ts` headless aus.
 *
 * Wie `run-api-tests.mjs`, aber ohne Fake für `@/lib/payments`: Die Store-
 * Routen sollen den echten Mailversand und die echten Marker benutzen. Ersetzt
 * werden nur die NextResponse-Helfer und die Apple-Testwurzel (damit signierte
 * Fixture-Payloads durch die echte Kettenprüfung laufen); Amazon RVS läuft
 * gegen einen lokalen HTTP-Server im Test.
 *
 * Aufruf: npm run test:store-api
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), "streaminghub-store-api-"));
const bundle = path.join(workDir, "store-routes.mjs");
const databasePath = path.join(workDir, "test.db");
const fakes = path.join(repoRoot, "scripts", "fakes", "api.ts");
const appleRoot = path.join(repoRoot, "scripts", "fakes", "apple-root.ts");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      path.join(repoRoot, "scripts", "store-refresh-routes.test.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--alias:@/lib/api=${fakes}`,
      `--alias:@/lib/apple-root-ca=${appleRoot}`,
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

  const run = spawnSync(process.execPath, [bundle], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_PATH: databasePath, NODE_ENV: "test" },
  });
  process.exit(run.status ?? 1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
