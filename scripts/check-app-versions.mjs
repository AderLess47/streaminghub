#!/usr/bin/env node
/**
 * Android, Apple und Vega OS muessen dieselbe Marketing-Version tragen. Die
 * Build-Nummern bleiben platformeigen, weil die Stores sie unabhaengig zaehlen.
 *
 * Aufruf: npm run check:app-versions
 *
 * Die Faelle selbst deckt scripts/check-app-versions.test.mjs ab.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILES = {
  android: path.join("android", "app", "build.gradle.kts"),
  apple: path.join("apple", "project.yml"),
  vegaManifest: path.join("vega", "manifest.toml"),
  vegaPackage: path.join("vega", "package.json"),
  vegaApp: path.join("vega", "src", "app.tsx"),
};

const ANDROID_VERSION = /versionName\s*=\s*"([^"]+)"/;
const ANDROID_CODE = /versionCode\s*=\s*(\d+)/;
const APPLE_VERSION = /MARKETING_VERSION:\s*"([^"]+)"/;
const APPLE_BUILD = /CURRENT_PROJECT_VERSION:\s*"([^"]+)"/;
// ^version trifft nur die Schluesselzeile, nicht z. B. "subversion = ...".
const VEGA_VERSION = /^version\s*=\s*"([^"]+)"/m;
const VEGA_APP_VERSION = /const APP_VERSION\s*=\s*"([^"]+)"/;

const first = (text, pattern) => text.match(pattern)?.[1];

// JSON statt Regex: "version" kann auch in Unterobjekten stehen.
function packageVersion(text) {
  try {
    return JSON.parse(text).version;
  } catch {
    return undefined;
  }
}

export function inspect({ android, apple, vegaManifest, vegaPackage, vegaApp }) {
  const sources = {
    Android: { file: FILES.android, field: "versionName", text: android, value: first(android, ANDROID_VERSION) },
    Apple: { file: FILES.apple, field: "MARKETING_VERSION", text: apple, value: first(apple, APPLE_VERSION) },
    Vega: { file: FILES.vegaManifest, field: "version", text: vegaManifest, value: first(vegaManifest, VEGA_VERSION) },
    "Vega package.json": { file: FILES.vegaPackage, field: "version", text: vegaPackage, value: packageVersion(vegaPackage) },
    "Vega App": { file: FILES.vegaApp, field: "APP_VERSION", text: vegaApp, value: first(vegaApp, VEGA_APP_VERSION) },
  };

  const versions = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.value]));
  const findings = [];

  for (const [name, source] of Object.entries(sources)) {
    if (!source.value) {
      findings.push({
        file: source.file,
        line: 1,
        snippet: `Marketing-Version fehlt (${name})`,
        hint: `${source.field} in ${source.file} pflegen`,
      });
    }
  }
  if (findings.length > 0) return { versions, findings };

  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1) {
    findings.push({
      file: FILES.android,
      line: 1,
      snippet: "Marketing-Versionen laufen auseinander",
      hint: Object.entries(versions)
        .map(([name, value]) => `${name}: ${value}`)
        .join(", "),
    });
    return { versions, findings };
  }

  const buildNumbers = {};
  for (const [name, source, pattern] of [
    ["Android versionCode", sources.Android, ANDROID_CODE],
    ["Apple CURRENT_PROJECT_VERSION", sources.Apple, APPLE_BUILD],
  ]) {
    const raw = first(source.text, pattern);
    if (!raw || !Number.isInteger(Number(raw)) || Number(raw) < 1) {
      findings.push({
        file: source.file,
        line: 1,
        snippet: `${name} fehlt oder ist keine positive Ganzzahl: ${raw ?? "fehlt"}`,
        hint: `positive Ganzzahl in ${source.file} eintragen`,
      });
    }
    buildNumbers[name] = raw;
  }

  return { versions, buildNumbers, findings };
}

export async function audit({ root = process.cwd() } = {}) {
  const sources = {};
  for (const [key, file] of Object.entries(FILES)) {
    sources[key] = fs.readFileSync(path.join(root, file), "utf8");
  }
  return inspect(sources);
}

async function main() {
  const { versions, buildNumbers, findings } = await audit();

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`::error file=${finding.file},line=${finding.line}::${finding.snippet} -- ${finding.hint}`);
    }
    console.error(
      `${findings.length} Befund(e): Android, Apple und Vega muessen dieselbe Marketing-Version tragen ` +
        "(Build-Nummern bleiben platformeigen).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `OK: Android, Apple und Vega stehen auf ${versions.Android} (Android ${buildNumbers["Android versionCode"]}).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
