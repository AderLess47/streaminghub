#!/usr/bin/env node
/**
 * Build, verify and publish the Android release APK to Cloudflare R2.
 *
 * Usage:
 *   npm run release:apk
 *   npm run release:apk -- --apk android/app/build/outputs/apk/direct/release/app-direct-release.apk
 *   npm run release:apk -- --dry-run
 *
 * Upload credentials (one of):
 *   CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, or `npx wrangler login`.
 * Keep tokens in the shell or in the git-ignored .env.release file.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatSize, renderRelease } from "./lib/release-file.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_VERSION = "4.160.0";
const PUBLIC_RETRY_ATTEMPTS = 30;
const PUBLIC_RETRY_DELAY_MS = 4_000;
const PUBLIC_RETRY_STATUSES = new Set([403, 404, 408, 425, 429, 500, 502, 503, 504]);

function parseArgs(argv) {
  const options = {
    dryRun: false,
    apk: null,
    bucket: process.env.R2_BUCKET?.trim() || "streaminghub-downloads",
    publicBase: (process.env.R2_PUBLIC_BASE?.trim() || "https://downloads.streaminghub.org").replace(/\/+$/, ""),
    help: false,
  };

  const readValue = (arg, index) => {
    const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} erwartet einen Wert`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--apk" || arg.startsWith("--apk=")) {
      options.apk = path.resolve(process.cwd(), readValue(arg, i));
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--bucket" || arg.startsWith("--bucket=")) {
      options.bucket = readValue(arg, i);
      if (!arg.includes("=")) i += 1;
    } else if (arg === "--public-base" || arg.startsWith("--public-base=")) {
      options.publicBase = readValue(arg, i).replace(/\/+$/, "");
      if (!arg.includes("=")) i += 1;
    } else {
      throw new Error(`Unbekannte Option: ${arg}`);
    }
  }

  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(options.bucket)) {
    throw new Error(`Ungültiger R2-Bucket-Name: ${options.bucket}`);
  }
  if (!/^https?:\/\//i.test(options.publicBase)) {
    throw new Error(`Ungültige öffentliche Basis-URL: ${options.publicBase}`);
  }
  return options;
}

function usage() {
  console.log(`Aufruf: npm run release:apk -- [Optionen]

Optionen:
  --apk <pfad>         Vorhandene signierte APK statt eines Neubaus verwenden
  --bucket <name>      R2-Bucket (Standard: R2_BUCKET oder streaminghub-downloads)
  --public-base <url>  Öffentliche R2-Domain (Standard: R2_PUBLIC_BASE oder
                       https://downloads.streaminghub.org)
  --dry-run            Prüfen und den Plan ausgeben; nichts hochladen oder schreiben
  --help               Diese Hilfe anzeigen

Umgebung:
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  nicht interaktiver R2-Upload
  JAVA_HOME, ANDROID_HOME                       Android-Build-Toolchain
  R2_BUCKET, R2_PUBLIC_BASE                      optionale Überschreibungen

Der Befehl liest versionName/versionCode aus android/app/build.gradle.kts.
Nach einem erfolgreichen Upload schreibt er src/content/release.ts neu, die
einzige Quelle der Download-Metadaten, und exportiert die APK_*-Werte nach
GITHUB_ENV. Produktion liest sie aus den Fly-Secrets, ein Deploy ist also nicht
nötig.
`);
}

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, { cwd = ROOT, env = process.env, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw new Error(`${command} konnte nicht gestartet werden: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} endete mit Code ${result.status}${detail ? `\n${detail}` : ""}`);
  }
  return result;
}

function buildEnv() {
  const env = { ...process.env };
  const localJdk = path.join(ROOT, ".tooling", "jdk-17");
  const localSdk = path.join(ROOT, ".tooling", "android-sdk");
  if (!env.JAVA_HOME && existsSync(localJdk)) env.JAVA_HOME = localJdk;
  if (!env.ANDROID_HOME && existsSync(localSdk)) env.ANDROID_HOME = localSdk;
  if (!env.ANDROID_SDK_ROOT && env.ANDROID_HOME) env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
  if (env.JAVA_HOME) {
    const javaBin = path.join(env.JAVA_HOME, "bin");
    const pathParts = (env.PATH ?? "").split(path.delimiter);
    if (!pathParts.includes(javaBin)) {
      env.PATH = `${javaBin}${path.delimiter}${env.PATH ?? ""}`;
    }
  }
  return env;
}

function resolveGradle() {
  if (process.env.GRADLE_BIN) return process.env.GRADLE_BIN;
  const localGradle = path.join(ROOT, ".tooling", "gradle-8.11.1", "bin", "gradle");
  if (existsSync(localGradle)) return localGradle;
  const wrapper = path.join(ROOT, "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (existsSync(wrapper)) return wrapper;
  return process.platform === "win32" ? "gradle.bat" : "gradle";
}

function findBuildTool(env, names) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(ROOT, ".tooling", "android-sdk");
  const buildTools = path.join(sdk, "build-tools");
  if (!existsSync(buildTools)) return null;
  const versions = readdirSync(buildTools)
    .filter((entry) => statSync(path.join(buildTools, entry)).isDirectory())
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    for (const name of names) {
      const candidate = path.join(buildTools, version, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findApksigner(env) {
  return findBuildTool(env, process.platform === "win32" ? ["apksigner.bat"] : ["apksigner"]);
}

function verifyApkMetadata(apk, version, versionCode, env) {
  const aapt = findBuildTool(env, process.platform === "win32" ? ["aapt.exe"] : ["aapt"]);
  if (!aapt) {
    console.warn("! aapt nicht gefunden – die APK-Versionsmetadaten konnten nicht geprüft werden");
    return;
  }
  const result = spawnSync(aapt, ["dump", "badging", apk], {
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw new Error(`aapt konnte nicht gestartet werden: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`APK-Metadaten konnten nicht gelesen werden:\n${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  }
  const packageLine = `${result.stdout ?? ""}`
    .split(/\r?\n/)
    .find((line) => line.startsWith("package:"));
  const actualVersion = packageLine?.match(/versionName='([^']*)'/)?.[1];
  const actualCode = packageLine?.match(/versionCode='([^']*)'/)?.[1];
  if (!packageLine || actualVersion !== version || actualCode !== String(versionCode)) {
    fail(
      `APK-Metadaten weichen ab: erwartet ${version} (Build ${versionCode}), ` +
        `gefunden ${actualVersion ?? "unbekannt"} (Build ${actualCode ?? "unbekannt"})`,
    );
  }
  console.log(`APK-Metadaten: ${actualVersion} (Build ${actualCode})`);
}

function verifySignature(apk, env) {
  const apksigner = findApksigner(env);
  if (!apksigner) {
    // Ein ungeprüfter APK darf nicht veröffentlicht werden: Die Downloadseite
    // verspricht Größe und SHA-256 der signierten Datei, und Nutzer installieren
    // sie per Sideload. Deshalb hier abbrechen statt nur zu warnen.
    fail(
      "apksigner nicht gefunden – ein APK ohne geprüfte Signatur wird nicht " +
        "veröffentlicht. Installiere die Android-Build-Tools oder setze " +
        "ANDROID_HOME/ANDROID_SDK_ROOT.",
    );
  }
  const result = spawnSync(apksigner, ["verify", "--print-certs", apk], {
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw new Error(`apksigner konnte nicht gestartet werden: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`APK-Signaturprüfung fehlgeschlagen:\n${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  }
  console.log("APK-Signatur: geprüft");
}

function wranglerCommand() {
  const local = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
  if (existsSync(local)) return { command: local, prefix: [] };
  return {
    command: process.platform === "win32" ? "npx.cmd" : "npx",
    prefix: ["--yes", `wrangler@${WRANGLER_VERSION}`],
  };
}

function ensureWranglerAuth() {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log("Cloudflare-Auth: API-Token aus der Umgebung");
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      console.warn("! CLOUDFLARE_ACCOUNT_ID ist nicht gesetzt; Wrangler versucht, das Konto zu ermitteln");
    }
    return;
  }

  const wrangler = wranglerCommand();
  const result = spawnSync(wrangler.command, [...wrangler.prefix, "whoami"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "pipe",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error || result.status !== 0 || /not authenticated|please run.*login/i.test(output)) {
    fail(
      "Cloudflare-Authentifizierung fehlt.\n" +
        "Setze CLOUDFLARE_API_TOKEN und CLOUDFLARE_ACCOUNT_ID in der Shell oder in .env.release\n" +
        "(niemals committen) oder führe aus: npx wrangler login",
    );
  }
  console.log("Cloudflare-Auth: Wrangler-Login");
}

async function fetchPublic(url, init, { attempts = PUBLIC_RETRY_ATTEMPTS, timeoutMs = 30_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!PUBLIC_RETRY_STATUSES.has(response.status) || attempt === attempts) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
    }
    console.warn(
      `Öffentliche URL noch nicht bereit (${lastError instanceof Error ? lastError.message : String(lastError)}); ` +
        `Versuch ${attempt + 1}/${attempts} in ${PUBLIC_RETRY_DELAY_MS / 1000} s …`,
    );
    await sleep(PUBLIC_RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("Anfrage an die öffentliche URL fehlgeschlagen");
}

async function verifyPublicObject(url, sizeBytes, sha256) {
  console.log(`Prüfe ${url} …`);
  const cacheBusted = new URL(url);
  cacheBusted.searchParams.set("v", sha256);
  // Cloudflare's bot challenge rejects Node's default user agent from GitHub runners.
  const response = await fetchPublic(cacheBusted.toString(), {
    cache: "no-store",
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      accept: "*/*",
    },
  }, { timeoutMs: 120_000 });
  if (!response.ok) fail(`Öffentlicher Download lieferte HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== sizeBytes) {
    fail(`Heruntergeladen: ${bytes.byteLength} Bytes, erwartet: ${sizeBytes}`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) fail(`Heruntergeladene SHA-256 ${actual}, erwartet ${sha256}`);
  console.log("Öffentliches Objekt: HTTP 200, Größe und SHA-256 stimmen");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const gradleFile = path.join(ROOT, "android", "app", "build.gradle.kts");
  const gradleText = await readFile(gradleFile, "utf8");
  const version = gradleText.match(/versionName\s*=\s*"([^"]+)"/)?.[1];
  const versionCodeRaw = gradleText.match(/versionCode\s*=\s*(\d+)/)?.[1];
  if (!version || !versionCodeRaw) fail("versionName/versionCode konnten nicht aus android/app/build.gradle.kts gelesen werden");
  if (!/^[0-9A-Za-z._+-]+$/.test(version)) fail(`Unsichere versionName: ${version}`);
  const versionCode = Number(versionCodeRaw);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) fail(`Ungültiger versionCode: ${versionCodeRaw}`);

  let apk = options.apk ?? path.join(ROOT, "android", "app", "build", "outputs", "apk", "direct", "release", "app-direct-release.apk");
  const env = buildEnv();

  if (!options.apk) {
    console.log(`Baue Release-APK für ${version} (Build ${versionCode}) …`);
    run(resolveGradle(), ["-p", "android", "--no-daemon", "assembleDirectRelease"], { env });
  } else {
    console.log(`Verwende vorhandene APK: ${apk}`);
  }
  if (!existsSync(apk)) fail(`APK nicht gefunden: ${apk}`);

  verifySignature(apk, env);
  verifyApkMetadata(apk, version, versionCode, env);
  const apkBytes = await readFile(apk);
  const sizeBytes = apkBytes.byteLength;
  const sizeLabel = formatSize(sizeBytes);
  const sha256 = createHash("sha256").update(apkBytes).digest("hex");
  const fileName = `streaminghub-${version}.apk`;
  const url = `${options.publicBase}/${encodeURIComponent(fileName)}?v=${sha256}`;
  const objectPath = `${options.bucket}/${fileName}`;

  console.log(`\nRelease: ${version} (Build ${versionCode})`);
  console.log(`APK:     ${apk}`);
  console.log(`Größe:   ${sizeBytes} Bytes (${sizeLabel})`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Objekt:  ${objectPath}`);
  console.log(`URL:     ${url}\n`);

  const wrangler = wranglerCommand();
  const uploadArgs = [
    ...wrangler.prefix,
    "r2",
    "object",
    "put",
    objectPath,
    "--file",
    apk,
    "--content-type",
    "application/vnd.android.package-archive",
    "--content-disposition",
    `attachment; filename="${fileName}"`,
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--remote",
    "--force",
  ];

  if (options.dryRun) {
    console.log(`[dry-run] ${wrangler.command} ${uploadArgs.join(" ")}`);
    console.log("[dry-run] kein Upload, keine öffentliche Prüfung, keine Dateiänderungen");
    return;
  }

  ensureWranglerAuth();
  console.log("Lade nach Cloudflare R2 hoch …");
  run(wrangler.command, uploadArgs);

  await verifyPublicObject(url, sizeBytes, sha256);

  const releaseFile = path.join(ROOT, "src", "content", "release.ts");
  await writeFile(
    releaseFile,
    renderRelease({ version, versionCode, fileName, url, sizeLabel, sizeBytes, sha256 }),
  );
  console.log("\nAktualisiert: src/content/release.ts");

  // The release workflow forwards these values to the next step through
  // GITHUB_ENV and stores them as Fly secrets, so production never needs a
  // commit to the protected branch.
  const workflowEnv = process.env.GITHUB_ENV;
  if (workflowEnv) {
    const exported = {
      APK_VERSION: version,
      APK_VERSION_CODE: String(versionCode),
      APK_FILE_NAME: fileName,
      APK_SHA256: sha256,
      APK_SIZE_BYTES: String(sizeBytes),
      APK_URL: url,
    };
    const lines = Object.entries(exported)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    await appendFile(workflowEnv, `${lines}\n`);
    console.log(`Release-Metadaten nach GITHUB_ENV exportiert: ${Object.keys(exported).join(", ")}`);
  } else {
    console.log("Als Nächstes: diese Werte als Fly-Secrets setzen oder die Website deployen.");
  }
}

main().catch((error) => {
  console.error(`\nRelease fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
