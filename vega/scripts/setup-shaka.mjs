#!/usr/bin/env node
/**
 * Holt Amazons gepatchten Shaka-Player und trägt ihn in die App ein.
 *
 * Der Player ist von Amazon als „proprietary/confidential“ gekennzeichnet und
 * darf deshalb nicht im Repository liegen. Dieses Skript lädt ihn aus Amazons
 * Download, baut ihn (Java 21+ und git nötig), kopiert Wrapper, Polyfills und
 * `dist` nach `src/` und ersetzt `src/player/shaka-registration.ts`. Die
 * kopierten Dateien sind in `vega/.gitignore` ausgenommen.
 *
 * Der Wrapper aus Amazons Tarball erbt von `../PlayerBase`, das im Paket fehlt.
 * Deshalb setzt das Skript Amazons selbstständige Sample-Fassung ein
 * (MIT-0-Repository `AmazonAppDev/vega-video-sample`).
 *
 * Aufruf:
 *   npm run setup:shaka
 *   npm run setup:shaka -- --release 4.16.13-r1.2
 *   npm run setup:shaka -- --tarball ~/Downloads/shaka-rel-v4.8.5-r1.7-devices_scope.tar.gz
 *   npm run setup:shaka -- --skip-build        # nur kopieren, `dist` muss schon da sein
 */

import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { cpSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

// 4.6.18 ist die letzte Auslieferung, deren ShakaPlayer.ts ohne Amazons
// separates PlayerBase.ts auskommt. Die neueren Pakete importieren
// `../PlayerBase`, liefern die Datei aber nicht mit – ohne sie bricht der
// Vega-Build ab (siehe README).
const DEFAULT_VERSION = "4.8.5";
const DEFAULT_RELEASE = "4.8.5-r1.7";
const VERSION = option("--release")?.split("-r")[0] ?? DEFAULT_VERSION;
const RELEASE = option("--release") ?? DEFAULT_RELEASE;
const ARCHIVE_URL = `https://amzndevresources.com/vega/media-player/shaka-rel-v${RELEASE}-devices_scope.tar.gz`;

const SAMPLE_WRAPPER_URL =
  "https://raw.githubusercontent.com/AmazonAppDev/vega-video-sample/main/src/w3cmedia/shakaplayer/ShakaPlayer.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workDir = path.join(appRoot, ".shaka-build");
const archivePath = path.join(workDir, `shaka-rel-v${RELEASE}.tar.gz`);

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
    // Amazons setup.sh klont in dieses Verzeichnis; ein Rest aus einem früheren
    // Lauf würde den Klon abbrechen.
    rmSync(path.join(releaseDir, "scripts", "shaka-player"), { recursive: true, force: true });
    execFileSync("bash", ["setup.sh"], {
      cwd: path.join(releaseDir, "scripts"),
      stdio: "inherit",
      // `git am` braucht eine Identität; ohne sie bricht der Patch-Schritt ab.
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "StreamingHub Build",
        GIT_AUTHOR_EMAIL: "build@localhost",
        GIT_COMMITTER_NAME: "StreamingHub Build",
        GIT_COMMITTER_EMAIL: "build@localhost",
      },
    });
  }

  step("Kopiere Wrapper, Polyfills und PlayerInterface nach src/");
  for (const folder of ["shakaplayer", "polyfills"]) {
    const target = path.join(appRoot, "src", folder);
    rmSync(target, { recursive: true, force: true });
    if (!copyInto(path.join(releaseDir, "src", folder), target)) {
      fail(`Amazons Paket enthält src/${folder} nicht.`);
    }
  }
  rmSync(path.join(appRoot, "src", "PlayerBase.ts"), { force: true });
  if (!copyInto(path.join(releaseDir, "src", "PlayerInterface.ts"), path.join(appRoot, "src", "PlayerInterface.ts"))) {
    fail("Amazons Paket enthält src/PlayerInterface.ts nicht.");
  }

  // Amazons Tarball liefert für 4.8.5/4.16 ein ShakaPlayer.ts, das von einem
  // `../PlayerBase` erbt – die Datei fehlt im Paket. Amazons eigenes Sample
  // (MIT-0) nutzt stattdessen einen selbstständigen Wrapper; den holen wir hier.
  const wrapperSource = path.join(appRoot, "src", "shakaplayer", "ShakaPlayer.ts");
  step("Ersetze den Wrapper durch Amazons selbstständige Sample-Fassung");
  try {
    const response = await fetch(SAMPLE_WRAPPER_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const wrapperText = await response.text();
    if (!wrapperText.includes("implements PlayerInterface")) {
      throw new Error("Die Datei sieht nicht wie Amazons ShakaPlayer-Wrapper aus.");
    }
    writeFileSync(wrapperSource, wrapperText, "utf8");
  } catch (error) {
    fail(
      `Der Sample-Wrapper konnte nicht geladen werden (${error instanceof Error ? error.message : error}). ` +
        "Alternativ ShakaPlayer.ts aus github.com/AmazonAppDev/vega-video-sample nach src/shakaplayer/ kopieren.",
    );
  }

  // Die 4.8.5- und 4.16.x-Wrapper erben von `../PlayerBase`, das Amazon nicht
  // mitliefert. Früher abbrechen als mitten im Vega-Build.

  // Amazons Quellen sind nicht für unsere tsconfig geschrieben (`global`,
  // DOM-Redeklarationen). `@ts-nocheck` hält `npm run typecheck` grün, ohne dass
  // wir den Code ändern.
  for (const folder of ["shakaplayer", "polyfills"]) {
    for (const file of readdirSync(path.join(appRoot, "src", folder), { recursive: true })) {
      const full = path.join(appRoot, "src", folder, String(file));
      if (!full.endsWith(".ts") || !existsSync(full)) continue;
      const content = readFileSync(full, "utf8");
      if (!content.startsWith("// @ts-nocheck")) {
        writeFileSync(full, `// @ts-nocheck\n// Amazon-Code, nicht Teil unserer Typprüfung.\n${content}`, "utf8");
      }
    }
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
