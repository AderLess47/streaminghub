#!/usr/bin/env node
/**
 * Keep `src/content/release.ts` in step with the release that production serves.
 *
 * Usage:
 *   npm run release:sync                 # refresh the local fallback
 *   npm run release:sync -- --check      # exit 1 when the fallback lags behind
 *   npm run release:sync -- --best-effort  # never fail a build (used by predev/prebuild)
 *   npm run release:sync -- --url http://localhost:3000/api/release
 *
 * The fallback only matters when the APK_* variables are missing (local builds,
 * a fresh deployment). Refreshing it here keeps checkouts and images from
 * carrying metadata older than what was live when they were built, without
 * writing to Git: branch protection rejects automated commits to main, and a
 * bot pull request cannot satisfy the required check.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { RELEASE_FILE, renderRelease, validateRelease } from "./lib/release-file.mjs";

const DEFAULT_SOURCE = "https://streaminghub.org/api/release";

function parseArgs(argv) {
  const options = {
    source: process.env.RELEASE_SOURCE_URL?.trim() || DEFAULT_SOURCE,
    check: false,
    bestEffort: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--best-effort") {
      options.bestEffort = true;
    } else if (arg === "--url" || arg.startsWith("--url=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(i += 1)];
      if (!value) throw new Error("--url erwartet einen Wert");
      options.source = value;
    } else {
      throw new Error(`Unbekannte Option: ${arg}`);
    }
  }

  if (!/^https?:\/\//i.test(options.source)) {
    throw new Error(`Ungültige Quell-URL: ${options.source}`);
  }
  return options;
}

function usage() {
  console.log(`Aufruf: npm run release:sync -- [Optionen]

Optionen:
  --url <url>     Quelle der Metadaten (Standard: RELEASE_SOURCE_URL oder
                  ${DEFAULT_SOURCE})
  --check         Nichts schreiben; mit Exit 1 enden, wenn src/content/release.ts veraltet ist
  --best-effort   Warnen statt fehlschlagen, wenn die Quelle nicht erreichbar ist
  --help          Diese Hilfe anzeigen
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  let payload;
  try {
    const response = await fetch(options.source, {
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "streaminghub-release-sync" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (options.bestEffort) {
      console.warn(`! ${options.source} nicht erreichbar (${detail}); die committeten Release-Metadaten bleiben erhalten`);
      return;
    }
    throw new Error(`${options.source} konnte nicht gelesen werden: ${detail}`);
  }

  const release = validateRelease(payload);
  if (!release) {
    if (options.bestEffort) {
      console.warn(`! ${options.source} lieferte keine nutzbaren Release-Metadaten; die committete Datei bleibt erhalten`);
      return;
    }
    throw new Error(`${options.source} lieferte keine nutzbaren Release-Metadaten`);
  }

  const current = existsSync(RELEASE_FILE) ? await readFile(RELEASE_FILE, "utf8") : "";
  const next = renderRelease(release);
  if (current === next) {
    console.log(`src/content/release.ts ist aktuell (${release.version}, ${release.sha256.slice(0, 8)}…)`);
    return;
  }
  if (options.check) {
    throw new Error(
      `src/content/release.ts ist hinter Produktion zurück (${release.version}, ${release.sha256.slice(0, 8)}…); führe npm run release:sync aus`,
    );
  }

  await writeFile(RELEASE_FILE, next);
  console.log(
    `src/content/release.ts auf ${release.version} aktualisiert ` +
      `(${release.sha256.slice(0, 8)}…, ${release.sizeLabel})`,
  );
}

main().catch((error) => {
  console.error(`\nRelease-Abgleich fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
