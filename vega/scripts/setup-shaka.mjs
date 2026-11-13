#!/usr/bin/env node
/**
 * Holt Amazons gepatchten Shaka-Player und trägt ihn in die App ein.
 *
 * Der Player ist von Amazon als „proprietary/confidential“ gekennzeichnet und
 * darf deshalb nicht im Repository liegen. Dieses Skript lädt ihn aus Amazons
 * Download, baut ihn (Java nötig), kopiert Wrapper, Polyfills und `dist` nach
 * `src/` und ersetzt `src/player/shaka-registration.ts`. Die kopierten Dateien
 * sind in `vega/.gitignore` ausgenommen.
 *
 * Aufruf:
 *   npm run setup:shaka
 *   npm run setup:shaka -- --tarball ~/Downloads/shaka-rel-v4.16.13-r1.2-devices_scope.tar.gz
 *   npm run setup:shaka -- --skip-build        # nur kopieren, `dist` muss schon da sein
 */

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "4.16.13";
const RELEASE = "4.16.13-r1.2";
const ARCHIVE_URL = `https://amzndevresources.com/vega/media-player/shaka-rel-v${RELEASE}-devices_scope.tar.gz`;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(appRoot, ".shaka-build");
const archivePath = path.join(workDir, `shaka-rel-v${RELEASE}.tar.gz`);

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const localArchive = option("--tarball");
const skipBuild = flag("--skip-build");

function fail(message) {
  console.error(`\nFehler: ${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`• ${message}`);
}

function hasCommand(command) {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function copyInto(source, target) {
  if (!existsSync(source)) return false;
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  return true;
}

async function download(url, target) {
  step(`Lade ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    fail(`Download fehlgeschlagen (HTTP ${response.status}). Bitte die Datei von Hand laden und mit --tarball übergeben.`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
}

async function main() {
  if (localArchive) {
    if (!existsSync(localArchive)) fail(`Archiv nicht gefunden: ${localArchive}`);
    mkdirSync(workDir, { recursive: true });
    cpSync(localArchive, archivePath);
  } else {
    mkdirSync(workDir, { recursive: true });
    if (!existsSync(archivePath)) await download(ARCHIVE_URL, archivePath);
  }

  step("Entpacke Archiv");
  execFileSync("tar", ["-xzf", archivePath, "-C", workDir], { stdio: "inherit" });

  const releaseDir = path.join(workDir, "shaka-rel");
  if (!existsSync(releaseDir)) fail("Das Archiv enthält kein Verzeichnis shaka-rel/.");

  if (!skipBuild) {
    if (!hasCommand("java")) {
      fail(
        "Java fehlt. Amazons setup.sh baut Shaka mit dem Closure-Compiler und braucht Java 21+. " +
          "Ohne Java: Archiv auf einem Rechner mit Java bauen und den fertigen dist-Ordner mit --skip-build einsetzen.",
      );
    }
    if (!hasCommand("git")) fail("git fehlt. Amazons setup.sh klont das Shaka-Repository.");
    step("Baue Shaka (kann einige Minuten dauern)");
    execFileSync("bash", ["setup.sh"], { cwd: path.join(releaseDir, "scripts"), stdio: "inherit" });
  }

  step("Kopiere Wrapper, Polyfills und PlayerBase nach src/");
  const wrappers = ["shakaplayer", "polyfills"];
  for (const folder of wrappers) {
    if (!copyInto(path.join(releaseDir, "src", folder), path.join(appRoot, "src", folder))) {
      fail(`Amazons Paket enthält src/${folder} nicht.`);
    }
  }
  const missing = [];
  for (const file of ["PlayerInterface.ts", "PlayerBase.ts"]) {
    if (!copyInto(path.join(releaseDir, "src", file), path.join(appRoot, "src", file))) {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    console.warn(
      `\nWarnung: ${missing.join(", ")} fehlt im Amazon-Paket. Der Shaka-Wrapper importiert ${missing.join(" und ")}; ` +
        "ohne diese Dateien bricht der Vega-Build ab. Bitte den Stand aus Amazons Shaka-Repository ergänzen " +
        "(siehe README, Abschnitt „HLS und DASH“).\n",
    );
  }

  const distSource = path.join(releaseDir, "scripts", "shaka-player", "dist");
  const distTarget = path.join(appRoot, "src", "shakaplayer", "dist");
  if (!copyInto(distSource, distTarget)) {
    fail(
      "Kein dist-Ordner gefunden. Erst `setup.sh` im entpackten Paket ausführen " +
        "(oder den fertigen dist-Ordner nach src/shakaplayer/dist kopieren).",
    );
  }
  const compiled = readdirSync(distTarget).filter((name) => name.startsWith("shaka-player.compiled"));
  if (compiled.length === 0) {
    fail("Im dist-Ordner liegt kein shaka-player.compiled*.js – der Wrapper kann so nicht laden.");
  }

  step("Ergänze Laufzeitabhängigkeiten");
  const dependencies = ["@xmldom/xmldom", "base-64", "fastestsmallesttextencoderdecoder"];
  try {
    execFileSync("npm", ["install", "--no-audit", "--no-fund", ...dependencies], {
      cwd: appRoot,
      stdio: "inherit",
    });
  } catch {
    console.warn("npm install ist fehlgeschlagen. Bitte die drei Pakete von Hand installieren:");
    console.warn(`  ${dependencies.join(" ")}`);
  }

  step("Trage den Player in src/player/shaka-registration.ts ein");
  writeFileSync(
    path.join(appRoot, "src", "player", "shaka-registration.ts"),
    `/**
 * Erzeugt von scripts/setup-shaka.mjs. Nicht committen: Der Shaka-Wrapper von
 * Amazon ist proprietär; im Repository steht an dieser Stelle die leere Variante.
 */
import { ShakaPlayer } from "../shakaplayer/ShakaPlayer";
import { registerShakaPlayer } from "./shaka-adapter";

registerShakaPlayer(ShakaPlayer, "${VERSION}");
`,
    "utf8",
  );

  console.log(`
Fertig. Nächste Schritte:
  1. npm run typecheck   (prüft auch die kopierten Dateien)
  2. npm run build       (Vega-Build; braucht das Vega SDK)
  3. HLS-Quelle öffnen; das Protokoll in den Einstellungen zeigt, ob Shaka geladen hat.

Hinweis: dist und Wrapper sind lokal und bleiben aus dem Repository heraus.
`);
}

main().catch((error) => {
  rmSync(path.join(workDir, "shaka-rel"), { recursive: true, force: true });
  fail(error instanceof Error ? error.message : String(error));
});
