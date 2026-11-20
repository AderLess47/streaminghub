#!/usr/bin/env node
/**
 * Post-deploy smoke test.
 *
 * `/api/release`, `/download` and `/app.apk` must describe the same release:
 * same version/build, same size and the same SHA-256. A mismatch means the
 * deployment, the Fly secrets and the uploaded object drifted apart.
 *
 * Usage:
 *   npm run smoke:deploy
 *   npm run smoke:deploy -- --base https://streaminghub.org
 *   npm run smoke:deploy -- --wait 300     # retry for up to 5 minutes
 *   npm run smoke:deploy -- --skip-apk     # skip the 14 MB download
 */
import { createHash } from "node:crypto";
import { validateRelease } from "./lib/release-file.mjs";

const DEFAULT_BASE = process.env.SMOKE_BASE_URL?.trim() || "https://streaminghub.org";
const REQUEST_TIMEOUT_MS = 60_000;

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE.replace(/\/+$/, ""), skipApk: false, waitSeconds: 0, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--skip-apk") {
      options.skipApk = true;
    } else if (arg === "--base" || arg.startsWith("--base=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(i += 1)];
      if (!value) throw new Error("--base erwartet einen Wert");
      options.base = value.replace(/\/+$/, "");
    } else if (arg === "--wait" || arg.startsWith("--wait=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(i += 1)];
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("--wait erwartet eine Anzahl Sekunden");
      options.waitSeconds = seconds;
    } else {
      throw new Error(`Unbekannte Option: ${arg}`);
    }
  }

  if (!/^https?:\/\//i.test(options.base)) throw new Error(`Ungültige Basis-URL: ${options.base}`);
  return options;
}

function usage() {
  console.log(`Aufruf: npm run smoke:deploy -- [Optionen]

Optionen:
  --base <url>    Zu prüfende Seite (Standard: SMOKE_BASE_URL oder ${DEFAULT_BASE})
  --wait <sek>    So lange wiederholen, bis alles übereinstimmt
  --skip-apk      APK nicht herunterladen und nicht hashen
  --help          Diese Hilfe anzeigen
`);
}

const short = (sha) => `${sha.slice(0, 12)}…`;

async function get(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { "user-agent": "streaminghub-deploy-smoke", accept: "*/*", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${url} lieferte HTTP ${response.status}`);
  return response;
}

async function checkOnce({ base, skipApk }) {
  const problems = [];

  const manifest = validateRelease(await (await get(`${base}/api/release`, { headers: { accept: "application/json" } })).json());
  if (!manifest) throw new Error(`${base}/api/release lieferte keine nutzbaren Release-Metadaten`);

  const page = await (await get(`${base}/download`)).text();
  const versionLabel = `${manifest.version} (Build ${manifest.versionCode})`;
  if (!page.includes(versionLabel)) problems.push(`/download zeigt nicht "${versionLabel}"`);
  if (!page.includes(manifest.sha256)) problems.push(`/download zeigt nicht die Prüfsumme ${short(manifest.sha256)}`);
  if (!page.includes(manifest.sizeLabel)) problems.push(`/download zeigt nicht die Größe ${manifest.sizeLabel}`);
  if (!page.includes('href="/app.apk"')) problems.push("/download verlinkt nicht den stabilen /app.apk-Endpunkt");

  console.log(`/api/release   ${versionLabel} · ${short(manifest.sha256)} · ${manifest.sizeBytes} Bytes`);
  console.log(`/download      ${versionLabel} · ${short(manifest.sha256)} · ${manifest.sizeLabel}`);

  if (!skipApk) {
    const response = await get(`${base}/app.apk`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    console.log(`/app.apk       HTTP ${response.status} · ${bytes.byteLength} Bytes · ${short(sha256)}`);

    if (bytes.byteLength !== manifest.sizeBytes) {
      problems.push(`/app.apk ist ${bytes.byteLength} Bytes groß, die Metadaten nennen ${manifest.sizeBytes}`);
    }
    if (sha256 !== manifest.sha256) {
      problems.push(`/app.apk hat die Prüfsumme ${short(sha256)}, die Metadaten nennen ${short(manifest.sha256)}`);
    }
  } else {
    console.log("/app.apk       übersprungen");
  }

  return problems;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const deadline = Date.now() + options.waitSeconds * 1000;
  let problems = [];

  for (;;) {
    problems = await checkOnce(options);
    if (problems.length === 0) {
      console.log(`\nOK: ${options.base} liefert einen konsistenten Release`);
      return;
    }
    if (Date.now() >= deadline) break;
    console.log(`\nNoch nicht konsistent (${problems.join("; ")}); neuer Versuch in 10 s …`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  console.error("\nDeploy-Smoke-Test fehlgeschlagen:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`\nDeploy-Smoke-Test fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
