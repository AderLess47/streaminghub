#!/usr/bin/env node
/**
 * Führt `scripts/headless-check.ts` unter Node aus.
 *
 * Die App-Module sind TypeScript mit ES-Imports ohne Dateiendung; deshalb
 * bündelt esbuild den Test samt der echten `src/`-Module in eine Datei, die
 * Node direkt starten kann. Nötig ist nur Node – kein Emulator, keine
 * Vega-CLI, kein Java.
 *
 * Aufruf: npm run test:headless
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), "vega-headless-"));
const bundle = path.join(workDir, "headless.mjs");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      path.join(appRoot, "scripts", "headless-check.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node20",
      `--outfile=${bundle}`,
      "--log-level=warning",
    ],
    { cwd: appRoot, stdio: "inherit" },
  );

  if (esbuild.status !== 0) {
    console.error("\nBündeln fehlgeschlagen – ohne Netzwerk geht es nicht (esbuild wird per npx geladen).");
    process.exit(esbuild.status ?? 1);
  }

  const run = spawnSync(process.execPath, [bundle], { cwd: appRoot, stdio: "inherit" });
  process.exit(run.status ?? 1);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
