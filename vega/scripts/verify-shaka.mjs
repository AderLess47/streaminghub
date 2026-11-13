#!/usr/bin/env node
/**
 * Prüft Setup, Build und HLS-Wiedergabe der Vega-App auf einem Rechner mit
 * Vega SDK. Gedacht für den Selbsttest vor einem Release und für einen
 * GitHub-Actions-Runner mit dem Label `vega` (siehe `.github/workflows/vega-shaka.yml`).
 *
 * Ablauf:
 *   1. Voraussetzungen prüfen (Node, Java 21, git, `vega`-CLI, Manifest).
 *   2. Abhängigkeiten und Amazons Shaka-Paket einsetzen (`npm run setup:shaka`).
 *   3. `tsc --noEmit`, Release-Build, `.vpkg` prüfen.
 *   4. Optional: App auf dem Gerät starten, HLS-Testquelle öffnen und die
 *      Marker `StreamingHub smoke: …` aus dem Log-Stream auswerten.
 *
 * Der Smoke-Modus steht in `src/smoke.ts`. Das Skript schreibt dort die
 * Test-URL hinein und stellt die Datei am Ende wieder zurück; der normale Build
 * bleibt unberührt.
 *
 * Aufruf:
 *   npm run verify:shaka
 *   npm run verify:shaka -- --device VirtualDevice:Tv --start-vvd \
 *       --smoke-url https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
 *   npm run verify:shaka -- --skip-build      # nur vorhandenes .vpkg testen
 *
 * Optionen:
 *   --device <name>     Gerät für den Wiedergabetest (ohne: nur Build-Prüfung)
 *   --smoke-url <url>   HLS-Quelle für den Wiedergabetest
 *   --timeout <sek>     Wartezeit auf die Wiedergabe (Standard 120)
 *   --start-vvd         Vega Virtual Device vorher starten
 *   --fresh-install     `npm ci` erzwingen
 *   --force-setup       Shaka auch neu einsetzen, wenn es schon daliegt
 *   --skip-install      `npm ci`/`npm install` überspringen
 *   --skip-setup        Shaka-Setup überspringen
 *   --skip-typecheck    Typprüfung überspringen
 *   --skip-build        Build überspringen, neuestes `.vpkg` verwenden
 *   --require-device    Ohne Gerät mit Fehler enden (für CI)
 *   --keep-smoke        Test-URL in `src/smoke.ts` stehen lassen (für Handtests)
 */

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(appRoot, "..");
const smokeFile = path.join(appRoot, "src", "smoke.ts");
const SMOKE_SOURCE = `/**
 * Einstiegspunkt für den HLS-Smoke-Test.
 *
 * \`scripts/verify-shaka.mjs\` schreibt hier vor dem Build eine Test-URL hinein,
 * startet die App auf einem Gerät und liest den Verlauf aus den Geräte-Logs.
 * Danach stellt das Skript die Datei wieder auf \`null\` zurück – im Repository
 * bleibt der Smoke-Modus also aus.
 *
 * Von Hand testen: URL eintragen, \`npm run build\`, App installieren, starten.
 */
export const SMOKE_HLS_URL: string | null = null;
`;

const help = `Prüft Shaka-Setup, Release-Build und HLS-Wiedergabe der Vega-App.

  npm run verify:shaka
  npm run verify:shaka -- --device VirtualDevice:Tv --start-vvd \\
      --smoke-url https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8

Optionen:
  --device <name>     Gerät für den Wiedergabetest (ohne: nur Build-Prüfung)
  --smoke-url <url>   HLS-Quelle für den Wiedergabetest
  --timeout <sek>     Wartezeit auf die Wiedergabe (Standard 120)
  --start-vvd         Vega Virtual Device vorher starten
  --fresh-install     npm ci erzwingen
  --force-setup       Shaka auch neu einsetzen, wenn es schon daliegt
  --skip-install      npm ci/npm install überspringen
  --skip-setup        Shaka-Setup überspringen
  --skip-typecheck    Typprüfung überspringen
  --skip-build        Build überspringen, neuestes .vpkg verwenden
  --require-device    Ohne Gerät mit Fehler enden (für CI)
  --keep-smoke        Test-URL in src/smoke.ts stehen lassen (für Handtests)`;

/* ------------------------------- Argumente -------------------------------- */

const options = {
  device: "",
  smokeUrl: "",
  timeout: 120,
  startVvd: false,
  freshInstall: false,
  forceSetup: false,
  skipInstall: false,
  skipSetup: false,
  skipTypecheck: false,
  skipBuild: false,
  requireDevice: false,
  keepSmoke: false,
};

function parseArguments() {
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--"))
        throw new Error(`${arg} braucht einen Wert.`);
      index += 1;
      return next;
    };
    switch (arg) {
      case "--device":
        options.device = value();
        break;
      case "--smoke-url":
        options.smokeUrl = value();
        break;
      case "--timeout": {
        const seconds = Number(value());
        if (!Number.isFinite(seconds) || seconds <= 0)
          throw new Error("--timeout braucht Sekunden.");
        options.timeout = seconds;
        break;
      }
      case "--start-vvd":
        options.startVvd = true;
        break;
      case "--fresh-install":
        options.freshInstall = true;
        break;
      case "--force-setup":
        options.forceSetup = true;
        break;
      case "--skip-install":
        options.skipInstall = true;
        break;
      case "--skip-setup":
        options.skipSetup = true;
        break;
      case "--skip-typecheck":
        options.skipTypecheck = true;
        break;
      case "--skip-build":
        options.skipBuild = true;
        break;
      case "--require-device":
        options.requireDevice = true;
        break;
      case "--keep-smoke":
        options.keepSmoke = true;
        break;
      case "--help":
      case "-h":
        console.log(help);
        process.exit(0);
        break;
      default:
        throw new Error(
          `Unbekannte Option: ${arg} (--help zeigt die Übersicht)`,
        );
    }
  }
}

/* --------------------------------- Ausgabe -------------------------------- */

const results = [];
const startedAt = Date.now();

function step(message) {
  console.log(`\n\u2022 ${message}`);
}

function pass(name, detail = "") {
  results.push({ name, state: "bestanden", detail });
  console.log(`  \u2713 ${name}${detail ? `: ${detail}` : ""}`);
}

function skip(name, detail = "") {
  results.push({ name, state: "übersprungen", detail });
  console.log(`  \u2013 ${name} übersprungen${detail ? `: ${detail}` : ""}`);
}

function warn(message) {
  console.log(`  ! ${message}`);
}

function fail(message) {
  throw new Error(message);
}

/* --------------------------------- Helfer --------------------------------- */

function run(command, args, extra = {}) {
  return spawnSync(command, args, {
    cwd: appRoot,
    encoding: "utf8",
    stdio: extra.quiet ? "pipe" : "inherit",
    env: process.env,
  });
}

function capture(command, args) {
  const result = spawnSync(command, args, { cwd: appRoot, encoding: "utf8" });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function hasCommand(command) {
  return capture(command, ["--version"]).ok;
}

function findPackage(directory, { skipNodeModules = false } = {}) {
  let newest = null;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (skipNodeModules && entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".vpkg")) {
        const time = statSync(full).mtimeMs;
        if (!newest || time > newest.time) newest = { file: full, time };
      }
    }
  };
  if (existsSync(directory)) walk(directory);
  return newest?.file ?? null;
}

function manifestId() {
  const manifest = readFileSync(path.join(appRoot, "manifest.toml"), "utf8");
  const match = manifest.match(/^\s*id\s*=\s*"([^"]+)"/m);
  return match ? match[1] : null;
}

function writeSmoke(url) {
  writeFileSync(
    smokeFile,
    SMOKE_SOURCE.replace("null;", `${JSON.stringify(url)};`),
    "utf8",
  );
}

function restoreSmoke() {
  if (existsSync(smokeFile)) writeFileSync(smokeFile, SMOKE_SOURCE, "utf8");
}

/* ------------------------------ Voraussetzungen --------------------------- */

function preflight() {
  step("Voraussetzungen prüfen");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (nodeMajor < 20)
    fail(`Node ${process.versions.node} ist zu alt, nötig ist 20 oder neuer.`);
  pass("Node", process.versions.node);

  if (!existsSync(path.join(appRoot, "manifest.toml")))
    fail("vega/manifest.toml fehlt.");
  if (!existsSync(path.join(appRoot, "package.json")))
    fail("vega/package.json fehlt.");

  const java = capture("java", ["-version"]);
  if (!java.ok) {
    fail(
      "Kein Java gefunden. Amazons setup.sh braucht JDK 21+ (z. B. Temurin 21, JAVA_HOME setzen).",
    );
  }
  const version = java.output.match(/version "(\d+)/);
  const javaMajor = version ? Number(version[1]) : 0;
  if (javaMajor && javaMajor < 21)
    fail(`Java ${javaMajor} gefunden, nötig ist 21 oder neuer.`);
  pass("Java", javaMajor ? `${javaMajor}` : "vorhanden");

  if (!hasCommand("git"))
    fail("git fehlt; Amazons setup.sh wendet Patches per git am an.");
  pass("git");

  const vega = capture("vega", ["--version"]);
  if (!vega.ok) {
    if (options.skipBuild) {
      warn(
        "Vega-CLI fehlt – ohne --skip-build ist kein Release-Build möglich.",
      );
    } else {
      fail(
        "Vega-CLI nicht gefunden. Vega Developer Tools installieren (developer.amazon.com/docs/vega) " +
          "und `vega --version` prüfen.",
      );
    }
  } else {
    pass("Vega-CLI", vega.output.split("\n").join(" / "));
  }

  const id = manifestId();
  if (!id) fail("In manifest.toml steht keine App-ID.");
  pass("App-ID", id);
  return id;
}

/* -------------------------------- Pipeline -------------------------------- */

function install() {
  step("Abhängigkeiten installieren");
  if (options.skipInstall) return skip("npm install");
  if (existsSync(path.join(appRoot, "node_modules")) && !options.freshInstall) {
    return skip(
      "npm install",
      "node_modules vorhanden (--fresh-install erzwingt npm ci)",
    );
  }
  const result = existsSync(path.join(appRoot, "package-lock.json"))
    ? run("npm", ["ci", "--no-audit", "--no-fund"])
    : run("npm", ["install", "--no-audit", "--no-fund"]);
  if (result.status !== 0) fail("npm-Installation fehlgeschlagen (Log oben).");
  pass("npm install");
}

function setupShaka() {
  step("Shaka-Player einsetzen");
  const installed = path.join(
    appRoot,
    "src",
    "shakaplayer",
    "dist",
    "shaka-player.compiled.js",
  );
  if (options.skipSetup) return skip("setup:shaka");
  if (existsSync(installed) && !options.forceSetup) {
    return skip(
      "setup:shaka",
      "Paket liegt schon in src/ (--force-setup erzwingt neu)",
    );
  }
  const result = run("node", ["scripts/setup-shaka.mjs"]);
  if (result.status !== 0) fail("Shaka-Setup fehlgeschlagen (Log oben).");
  if (!existsSync(installed))
    fail(
      "Shaka-Setup meldet Erfolg, aber dist/shaka-player.compiled.js fehlt.",
    );
  pass("setup:shaka");
}

function typecheck() {
  step("Typprüfung");
  if (options.skipTypecheck) return skip("tsc --noEmit");
  const result = run("npx", ["tsc", "--noEmit"]);
  if (result.status !== 0) fail("Typprüfung fehlgeschlagen.");
  pass("tsc --noEmit");
}

function build() {
  step("Release-Build");
  if (options.skipBuild) {
    if (options.smokeUrl)
      warn(
        "--skip-build: das vorhandene .vpkg muss die Smoke-URL schon enthalten.",
      );
    return skip("npm run build", "verwende vorhandenes .vpkg");
  }
  const result = run("npm", ["run", "build"]);
  if (result.status !== 0) fail("Release-Build fehlgeschlagen (Log oben).");
  pass("npm run build");
}

function checkArtifacts() {
  step("Artefakte prüfen");

  const dist = path.join(
    appRoot,
    "src",
    "shakaplayer",
    "dist",
    "shaka-player.compiled.js",
  );
  if (!existsSync(dist))
    fail("shaka-player.compiled.js fehlt – ohne Shaka bleibt HLS aus.");
  const size = statSync(dist).size;
  if (size < 500_000)
    fail(
      `shaka-player.compiled.js ist nur ${size} Bytes groß – Build unvollständig?`,
    );
  pass("Shaka-Bibliothek", `${Math.round(size / 1024)} KiB`);

  const registration = readFileSync(
    path.join(appRoot, "src", "player", "shaka-registration.ts"),
    "utf8",
  );
  if (!registration.includes("registerShakaPlayer")) {
    fail("shaka-registration.ts ist leer – die App würde ohne Shaka bauen.");
  }
  pass("Registrierung");

  const vpkg =
    findPackage(path.join(appRoot, "build")) ??
    findPackage(appRoot, { skipNodeModules: true });
  if (!vpkg) fail("Kein .vpkg gefunden. Erst bauen (ohne --skip-build).");
  const vpkgSize = statSync(vpkg).size;
  if (vpkgSize < 1_000_000)
    fail(`.vpkg ist nur ${vpkgSize} Bytes groß: ${vpkg}`);
  pass(
    "Paket",
    `${path.relative(appRoot, vpkg)} (${(vpkgSize / 1024 / 1024).toFixed(1)} MiB)`,
  );
  return vpkg;
}

/* ------------------------------- Wiedergabe ------------------------------- */

async function playback(vpkg, appId) {
  if (!options.device) {
    if (options.requireDevice)
      fail("--require-device gesetzt, aber kein --device angegeben.");
    return skip("HLS-Wiedergabe", "kein Gerät angegeben (--device <name>)");
  }
  if (!options.smokeUrl) {
    if (options.requireDevice)
      fail("--require-device gesetzt, aber keine --smoke-url angegeben.");
    return skip("HLS-Wiedergabe", "keine --smoke-url angegeben");
  }

  step(`HLS-Wiedergabe auf ${options.device} prüfen`);
  if (!/\.m3u8($|\?)/i.test(options.smokeUrl)) {
    warn("Die URL endet nicht auf .m3u8 – der Test geht trotzdem weiter.");
  }

  if (options.startVvd) {
    const vvd = run("vega", ["virtual-device", "start"]);
    if (vvd.status !== 0) fail("Virtuelles Gerät ließ sich nicht starten.");
  }

  const connected = run(
    "vega",
    ["device", "is-connected", "--device", options.device],
    { quiet: true },
  );
  if (connected.status !== 0) {
    fail(
      `Gerät "${options.device}" ist nicht verbunden. Erreichbare Geräte: vega device list` +
        (options.startVvd ? "" : " (oder --start-vvd verwenden)"),
    );
  }
  pass("Gerät verbunden", options.device);

  const logDirectory = path.join(repoRoot, "artifacts", "vega-logs");
  mkdirSync(logDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(logDirectory, `smoke-${stamp}.log`);
  writeFileSync(logFile, "", "utf8");

  let stream = null;
  try {
    step("App installieren und starten");
    const launched = run("vega", [
      "run-app",
      vpkg,
      appId,
      "-d",
      options.device,
    ]);
    if (launched.status !== 0) fail(`vega run-app fehlgeschlagen für ${vpkg}.`);

    stream = spawn(
      "vega",
      ["device", "start-log-stream", "--device", options.device],
      {
        cwd: appRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const append = (chunk) => {
      writeFileSync(logFile, chunk.toString(), { flag: "a" });
    };
    stream.stdout?.on("data", append);
    stream.stderr?.on("data", append);

    const deadline = Date.now() + options.timeout * 1000;
    let outcome = "timeout";
    let seen = "";
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      seen = readFileSync(logFile, "utf8");
      if (seen.includes("StreamingHub smoke: wiedergabe laeuft")) {
        outcome = "playing";
        break;
      }
      const error = seen.match(/StreamingHub smoke: fehler[^\n]*/);
      if (error) {
        outcome = "error";
        console.log(`  ${error[0]}`);
        break;
      }
    }

    if (outcome === "playing") {
      pass("HLS-Wiedergabe", options.smokeUrl);
    } else if (outcome === "error") {
      fail(
        `Die Wiedergabe meldete einen Fehler. Vollständiges Log: ${logFile}`,
      );
    } else {
      const tail = seen.trim().split("\n").slice(-8).join("\n");
      fail(
        `Nach ${options.timeout}s kein "wiedergabe laeuft". Log: ${logFile}` +
          (tail
            ? `\nLetzte Zeilen:\n${tail}`
            : "\nDas Log ist leer – streamt das Gerät überhaupt?"),
      );
    }
  } finally {
    if (stream) stream.kill("SIGTERM");
    run("vega", ["device", "stop-log-stream", "--device", options.device], {
      quiet: true,
    });
    console.log(`  Log: ${path.relative(repoRoot, logFile)}`);
  }
}

/* ---------------------------------- Main ---------------------------------- */

function report() {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log("\nZusammenfassung");
  for (const result of results) {
    console.log(
      `  [${result.state}] ${result.name}${result.detail ? ` – ${result.detail}` : ""}`,
    );
  }
  console.log(`\nFertig in ${seconds}s.`);
  if (results.some((result) => result.state === "übersprungen")) {
    console.log(
      "Übersprungene Schritte sind nicht geprüft – das steht so auch im Bericht.",
    );
  }
}

async function main() {
  if (!existsSync(smokeFile)) writeFileSync(smokeFile, SMOKE_SOURCE, "utf8");

  try {
    const appId = preflight();
    install();
    setupShaka();
    typecheck();

    if (options.smokeUrl && !options.skipBuild) {
      writeSmoke(options.smokeUrl);
      pass("Smoke-Quelle eingetragen", options.smokeUrl);
    }
    build();
    const vpkg = checkArtifacts();
    await playback(vpkg, appId);
  } finally {
    if (!options.keepSmoke) restoreSmoke();
  }
  report();
}

try {
  parseArguments();
  await main();
} catch (error) {
  restoreSmoke();
  console.error(
    `\nFehler: ${error instanceof Error ? error.message : String(error)}`,
  );
  report();
  process.exit(1);
}
