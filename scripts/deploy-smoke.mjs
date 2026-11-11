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
      if (!value) throw new Error("--base requires a value");
      options.base = value.replace(/\/+$/, "");
    } else if (arg === "--wait" || arg.startsWith("--wait=")) {
      const value = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : argv[(i += 1)];
      const seconds = Number(value);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("--wait requires a number of seconds");
      options.waitSeconds = seconds;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!/^https?:\/\//i.test(options.base)) throw new Error(`Invalid base URL: ${options.base}`);
  return options;
}

function usage() {
  console.log(`Usage: npm run smoke:deploy -- [options]

Options:
  --base <url>    Site to test (default: SMOKE_BASE_URL or ${DEFAULT_BASE})
  --wait <secs>   Retry until everything agrees, at most this long
  --skip-apk      Do not download and hash the APK
  --help          Show this help
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
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function checkOnce({ base, skipApk }) {
  const problems = [];

  const manifest = validateRelease(await (await get(`${base}/api/release`, { headers: { accept: "application/json" } })).json());
  if (!manifest) throw new Error(`${base}/api/release returned no usable release metadata`);

  const page = await (await get(`${base}/download`)).text();
  const versionLabel = `${manifest.version} (Build ${manifest.versionCode})`;
  if (!page.includes(versionLabel)) problems.push(`/download does not show "${versionLabel}"`);
  if (!page.includes(manifest.sha256)) problems.push(`/download does not show the checksum ${short(manifest.sha256)}`);
  if (!page.includes(manifest.sizeLabel)) problems.push(`/download does not show the size ${manifest.sizeLabel}`);
  if (!page.includes('href="/app.apk"')) problems.push("/download does not link the stable /app.apk endpoint");

  console.log(`/api/release   ${versionLabel} · ${short(manifest.sha256)} · ${manifest.sizeBytes} bytes`);
  console.log(`/download      ${versionLabel} · ${short(manifest.sha256)} · ${manifest.sizeLabel}`);

  if (!skipApk) {
    const response = await get(`${base}/app.apk`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    console.log(`/app.apk       HTTP ${response.status} · ${bytes.byteLength} bytes · ${short(sha256)}`);

    if (bytes.byteLength !== manifest.sizeBytes) {
      problems.push(`/app.apk is ${bytes.byteLength} bytes, metadata says ${manifest.sizeBytes}`);
    }
    if (sha256 !== manifest.sha256) {
      problems.push(`/app.apk checksum is ${short(sha256)}, metadata says ${short(manifest.sha256)}`);
    }
  } else {
    console.log("/app.apk       skipped");
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
      console.log(`\nOK: ${options.base} serves one consistent release`);
      return;
    }
    if (Date.now() >= deadline) break;
    console.log(`\nNot consistent yet (${problems.join("; ")}); retrying in 10s ...`);
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  console.error("\nDeploy smoke test failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`\nDeploy smoke test failed: ${error.message}`);
  process.exit(1);
});
