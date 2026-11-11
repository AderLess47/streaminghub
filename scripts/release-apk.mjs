#!/usr/bin/env node
/**
 * Build, verify and publish the Android release APK to Cloudflare R2.
 *
 * Usage:
 *   npm run release:apk
 *   npm run release:apk -- --apk android/app/build/outputs/apk/release/app-release.apk
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_VERSION = "4.160.0";
const PUBLIC_RETRY_ATTEMPTS = 30;
const PUBLIC_RETRY_DELAY_MS = 4_000;
const PUBLIC_RETRY_STATUSES = new Set([403, 404, 408, 425, 429, 500, 502, 503, 504]);
const DOWNLOAD_KEYS = ["DOWNLOAD_FIRE_TV_URL", "DOWNLOAD_ANDROID_TV_URL", "DOWNLOAD_ANDROID_MOBILE_URL"];

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
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
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
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!/^[a-z0-9][a-z0-9.-]*$/i.test(options.bucket)) {
    throw new Error(`Invalid R2 bucket name: ${options.bucket}`);
  }
  if (!/^https?:\/\//i.test(options.publicBase)) {
    throw new Error(`Invalid public base URL: ${options.publicBase}`);
  }
  return options;
}

function usage() {
  console.log(`Usage: npm run release:apk -- [options]

Options:
  --apk <path>         Use an existing signed APK instead of building one
  --bucket <name>      R2 bucket (default: R2_BUCKET or streaminghub-downloads)
  --public-base <url>  Public R2 domain (default: R2_PUBLIC_BASE or
                       https://downloads.streaminghub.org)
  --dry-run            Validate and print the plan; do not upload or write
  --help               Show this help

Environment:
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID  non-interactive R2 upload
  JAVA_HOME, ANDROID_HOME                       Android build toolchain
  R2_BUCKET, R2_PUBLIC_BASE                      optional overrides

The command reads versionName/versionCode from android/app/build.gradle.kts.
After a successful upload it updates src/content/release.ts, fly.toml,
.env.example and .env.local so every download URL points at the new object.
Deploy the website separately with "flyctl deploy --app streaminghub-org".
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
  if (result.error) throw new Error(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} exited with code ${result.status}${detail ? `\n${detail}` : ""}`);
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
    console.warn("! aapt not found - APK version metadata could not be verified");
    return;
  }
  const result = spawnSync(aapt, ["dump", "badging", apk], {
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw new Error(`Could not run aapt: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`Could not read APK metadata:\n${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  }
  const packageLine = `${result.stdout ?? ""}`
    .split(/\r?\n/)
    .find((line) => line.startsWith("package:"));
  const actualVersion = packageLine?.match(/versionName='([^']*)'/)?.[1];
  const actualCode = packageLine?.match(/versionCode='([^']*)'/)?.[1];
  if (!packageLine || actualVersion !== version || actualCode !== String(versionCode)) {
    fail(
      `APK metadata mismatch: expected ${version} (build ${versionCode}), ` +
        `found ${actualVersion ?? "unknown"} (build ${actualCode ?? "unknown"})`,
    );
  }
  console.log(`APK metadata: ${actualVersion} (build ${actualCode})`);
}

function verifySignature(apk, env) {
  const apksigner = findApksigner(env);
  if (!apksigner) {
    console.warn("! apksigner not found - signature could not be verified");
    return;
  }
  const result = spawnSync(apksigner, ["verify", "--print-certs", apk], {
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw new Error(`Could not run apksigner: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`APK signature verification failed:\n${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  }
  console.log("APK signature: verified");
}

function formatSize(bytes) {
  const mib = bytes / (1024 * 1024);
  return mib >= 10 ? `${Math.round(mib)} MB` : `${mib.toFixed(1)} MB`;
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
    console.log("Cloudflare auth: API token from environment");
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      console.warn("! CLOUDFLARE_ACCOUNT_ID is not set; Wrangler will try to infer the account");
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
      "Cloudflare authentication missing.\n" +
        "Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the shell or in .env.release\n" +
        "(never commit them), or run: npx wrangler login",
    );
  }
  console.log("Cloudflare auth: Wrangler login");
}

function renderRelease({ version, versionCode, fileName, url, sizeLabel, sizeBytes, sha256 }) {
  return `/**
 * Public Android release served by the website.
 * Generated by scripts/release-apk.mjs. Do not edit by hand.
 */
export const androidRelease = {
  version: ${JSON.stringify(version)},
  versionCode: ${versionCode},
  fileName: ${JSON.stringify(fileName)},
  path: ${JSON.stringify(url)},
  sizeLabel: ${JSON.stringify(sizeLabel)},
  sizeBytes: ${sizeBytes},
  sha256: ${JSON.stringify(sha256)},
} as const;
`;
}

async function updateDownloadUrls(file, url, style, dryRun) {
  if (!existsSync(file)) return false;
  const original = await readFile(file, "utf8");
  const pattern = style === "toml"
    ? /^(\s*DOWNLOAD_(?:FIRE_TV|ANDROID_TV|ANDROID_MOBILE)_URL\s*=\s*)"[^"]*"/gm
    : /^(\s*(?:export\s+)?DOWNLOAD_(?:FIRE_TV|ANDROID_TV|ANDROID_MOBILE)_URL\s*=\s*).*$/gm;
  const matches = original.match(pattern)?.length ?? 0;
  if (matches === 0) {
    console.warn(`! ${path.relative(ROOT, file)} has no DOWNLOAD_*_URL entries; left unchanged`);
    return false;
  }
  const updated = original.replace(pattern, (_, prefix) =>
    `${prefix}${style === "toml" ? `"${url}"` : url}`,
  );
  if (updated !== original && !dryRun) await writeFile(file, updated);
  return updated !== original;
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
      `Public URL not ready (${lastError instanceof Error ? lastError.message : String(lastError)}); ` +
        `retry ${attempt + 1}/${attempts} in ${PUBLIC_RETRY_DELAY_MS / 1000}s ...`,
    );
    await sleep(PUBLIC_RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("Public URL request failed");
}

async function verifyPublicObject(url, sizeBytes, sha256) {
  console.log(`Verifying ${url} ...`);
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
  if (!response.ok) fail(`Public download returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength !== sizeBytes) {
    fail(`Downloaded ${bytes.byteLength} bytes, expected ${sizeBytes}`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) fail(`Downloaded SHA-256 ${actual}, expected ${sha256}`);
  console.log("Public object: HTTP 200, size and SHA-256 match");
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
  if (!version || !versionCodeRaw) fail("Could not read versionName/versionCode from android/app/build.gradle.kts");
  if (!/^[0-9A-Za-z._+-]+$/.test(version)) fail(`Unsafe versionName: ${version}`);
  const versionCode = Number(versionCodeRaw);
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) fail(`Invalid versionCode: ${versionCodeRaw}`);

  let apk = options.apk ?? path.join(ROOT, "android", "app", "build", "outputs", "apk", "release", "app-release.apk");
  const env = buildEnv();

  if (!options.apk) {
    console.log(`Building release APK for ${version} (build ${versionCode}) ...`);
    run(resolveGradle(), ["-p", "android", "--no-daemon", "assembleRelease"], { env });
  } else {
    console.log(`Using existing APK: ${apk}`);
  }
  if (!existsSync(apk)) fail(`APK not found: ${apk}`);

  verifySignature(apk, env);
  verifyApkMetadata(apk, version, versionCode, env);
  const apkBytes = await readFile(apk);
  const sizeBytes = apkBytes.byteLength;
  const sizeLabel = formatSize(sizeBytes);
  const sha256 = createHash("sha256").update(apkBytes).digest("hex");
  const fileName = `streaminghub-${version}.apk`;
  const url = `${options.publicBase}/${encodeURIComponent(fileName)}?v=${sha256}`;
  const objectPath = `${options.bucket}/${fileName}`;

  console.log(`\nRelease: ${version} (build ${versionCode})`);
  console.log(`APK:     ${apk}`);
  console.log(`Size:    ${sizeBytes} bytes (${sizeLabel})`);
  console.log(`SHA-256: ${sha256}`);
  console.log(`Object:  ${objectPath}`);
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
    console.log("[dry-run] no upload, no public verification, no file changes");
    return;
  }

  ensureWranglerAuth();
  console.log("Uploading to Cloudflare R2 ...");
  run(wrangler.command, uploadArgs);

  await verifyPublicObject(url, sizeBytes, sha256);

  const releaseFile = path.join(ROOT, "src", "content", "release.ts");
  await writeFile(
    releaseFile,
    renderRelease({ version, versionCode, fileName, url, sizeLabel, sizeBytes, sha256 }),
  );
  const changed = ["src/content/release.ts"];
  const configs = [
    [path.join(ROOT, ".env.example"), "env"],
    [path.join(ROOT, ".env.local"), "env"],
    [path.join(ROOT, "fly.toml"), "toml"],
  ];
  for (const [file, style] of configs) {
    if (await updateDownloadUrls(file, url, style, false)) changed.push(path.relative(ROOT, file));
  }

  console.log(`\nUpdated: ${changed.join(", ")}`);

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
    console.log(`Exported release metadata to GITHUB_ENV: ${Object.keys(exported).join(", ")}`);
  } else {
    console.log("Next: set these values as Fly secrets or deploy the website.");
  }
}

main().catch((error) => {
  console.error(`\nRelease failed: ${error.message}`);
  process.exit(1);
});
