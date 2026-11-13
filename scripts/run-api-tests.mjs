#!/usr/bin/env node
/**
 * Führt `scripts/api-routes.test.ts` headless aus: Fortschritt, Kopplung, Geräte-
 * Aktivierung und Playlist-Abruf.
 *
 * Die Routen importieren über den Next-Alias `@/…`; esbuild bündelt sie mit
 * `@` → `src` und ersetzt nur die Teile, die ohne Server fehlen
 * (Session, Premium-Status, NextResponse-Helfer). Die Datenbank ist eine
 * echte SQLite-Datei in einem temporären Verzeichnis, das Schema legt
 * `src/lib/db.ts` selbst an.
 *
 * Aufruf: npm run test:api
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = mkdtempSync(path.join(tmpdir(), "streaminghub-progress-"));
const bundle = path.join(workDir, "api-routes.mjs");
const databasePath = path.join(workDir, "test.db");
const fakes = path.join(repoRoot, "scripts", "fakes", "api.ts");

try {
  const esbuild = spawnSync(
    "npx",
    [
      "--yes",
      "esbuild@0.25.0",
      path.join(repoRoot, "scripts", "api-routes.test.ts"),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node22",
      `--alias:@/lib/api=${fakes}`,
      `--alias:@/lib/payments=${fakes}`,
      `--alias:@/lib/session=${fakes}`,
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
