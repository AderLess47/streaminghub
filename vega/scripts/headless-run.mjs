#!/usr/bin/env node
/**
 * Führt einen Headless-Test der Vega-App unter Node aus.
 *
 * Die App-Module sind TypeScript mit ES-Imports ohne Dateiendung; deshalb
 * bündelt esbuild den Test samt der echten `src/`-Module in eine Datei, die
 * Node direkt starten kann. Nötig ist nur Node – kein Emulator, keine
 * Vega-CLI, kein Java. `@react-native-async-storage/async-storage` wird durch
 * den In-Memory-Mock ersetzt.
 *
 * Aufruf:
 *   node scripts/headless-run.mjs scripts/headless-check.ts
 *   npm run test:headless
 *   npm run test:resume
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = process.argv[2]
  ? path.resolve(appRoot, process.argv[2])
  : path.join(appRoot, "scripts", "headless-check.ts");

if (!existsSync(entry)) {
  console.error(`Testdatei nicht gefunden: ${entry}`);
  process.exit(1);
}

const workDir = mkdtempSync(path.join(tmpdir(), "vega-headless-"));
const bundle = path.join(workDir, "headless.mjs");

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
      "--target=node20",
      // AsyncStorage gibt es unter Node nicht; die Tests nutzen die Map aus dem Mock.
      `--alias:@react-native-async-storage/async-storage=${path.join(appRoot, "scripts", "mocks", "async-storage.ts")}`,
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
