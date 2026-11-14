#!/usr/bin/env node
/**
 * Führt `scripts/device-revoke.test.ts` headless aus. Ersetzt nur die
 * Next.js-Helfer; Aktionen, Geräteprüfung und Token-Code laufen im Original.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), "streaminghub-device-revoke-"));
const bundle = path.join(workDir, "device-revoke.mjs");
const databasePath = path.join(workDir, "test.db");
const fakes = path.join(repoRoot, "scripts", "fakes");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      path.join(repoRoot, "scripts", "device-revoke.test.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--alias:next/server=${path.join(fakes, "next-server.ts")}`,
      `--alias:next/headers=${path.join(fakes, "next-headers.ts")}`,
      `--alias:next/navigation=${path.join(fakes, "next-navigation.ts")}`,
      `--alias:next/cache=${path.join(fakes, "next-cache.ts")}`,
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
  const run = spawnSync(process.execPath, [bundle], { cwd: repoRoot, stdio: "inherit", env });
  process.exit(run.status ?? 1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
